import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, clusterApiUrl } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import idl from "@/idl/roofic.json";
import type { Roofic } from "@/idl/roofic";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");
const PROGRAM_ID = new PublicKey(idl.address);

const configPda = (): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];

const investorPda = (wallet: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from("investor"), wallet.toBuffer()], PROGRAM_ID)[0];

function loadAdminKeypair(): Keypair {
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH ?? `${homedir()}/.config/solana/id.json`;
  const raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ keypairPath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/**
 * POST /api/faucet
 * Devnet demo helper signed by the platform admin / test-USDC mint authority:
 *  - `{ action: "mint_usdc", wallet: "<pubkey>", amount?: 1000 }`
 *  - `{ action: "kyc_approve", wallet: "<pubkey>" }`
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: "mint_usdc" | "kyc_approve";
      wallet: string;
      amount?: number;
    };
    const targetWallet = new PublicKey(body.wallet);
    const admin = loadAdminKeypair();
    const connection = new Connection(RPC_URL, "confirmed");
    const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" });
    const program = new Program<Roofic>(idl as unknown as Roofic, provider);

    const cfg = await program.account.platformConfig.fetch(configPda());

    if (body.action === "kyc_approve") {
      const sig = await program.methods
        .approveInvestor()
        .accountsPartial({
          config: configPda(),
          investorRecord: investorPda(targetWallet),
          wallet: targetWallet,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      return NextResponse.json({ ok: true, sig });
    }

    if (body.action === "mint_usdc") {
      const paymentMint = cfg.paymentMint;
      const mintAcct = await connection.getAccountInfo(paymentMint);
      if (!mintAcct) throw new Error("Payment mint account not found on cluster");
      const tokenProg = mintAcct.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const mintInfo = await getMint(connection, paymentMint, "confirmed", tokenProg);
      const ata = getAssociatedTokenAddressSync(paymentMint, targetWallet, false, tokenProg);
      const humanAmount = body.amount ?? 1_000;
      const rawAmount = BigInt(Math.round(humanAmount * 10 ** mintInfo.decimals));

      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          ata,
          targetWallet,
          paymentMint,
          tokenProg,
        ),
        createMintToCheckedInstruction(
          paymentMint,
          ata,
          admin.publicKey,
          rawAmount,
          mintInfo.decimals,
          [],
          tokenProg,
        ),
      );
      const sig = await provider.sendAndConfirm(tx);
      return NextResponse.json({ ok: true, sig, ata: ata.toBase58(), amount: humanAmount });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
