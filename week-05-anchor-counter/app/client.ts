// ============================================================================
// TypeScript Client для Anchor Counter Program
// Взаимодействие с программой через @coral-xyz/anchor
// ============================================================================

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Загружаем IDL (будет сгенерирован после anchor build)
import idl from "../target/idl/counter_program.json" assert { type: "json" };

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║    🔢 Anchor Counter Program — Client                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 1. Подключение
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // 2. Загружаем wallet
  const keypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const wallet = new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(secretKey)));

  console.log(`👤 Wallet: ${wallet.publicKey.toBase58()}`);

  // 3. Настройка провайдера и программы
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new Program(idl as any, provider);

  console.log(`📦 Program ID: ${program.programId.toBase58()}`);

  // 4. Находим PDA для counter
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), wallet.publicKey.toBuffer()],
    program.programId
  );
  console.log(`🔑 Counter PDA: ${counterPda.toBase58()}\n`);

  // 5. Проверяем, инициализирован ли counter
  let counterAccount = await connection.getAccountInfo(counterPda);

  if (!counterAccount) {
    console.log("─── Initializing Counter ───");
    const tx = await program.methods
      .initialize()
      .accounts({
        authority: wallet.publicKey,
      })
      .rpc();
    console.log(`✅ Initialized! Tx: ${tx}\n`);
  } else {
    console.log("ℹ️  Counter already initialized\n");
  }

  // 6. Читаем текущее значение
  let counter = await program.account.counter.fetch(counterPda);
  console.log(`📊 Current count: ${counter.count}`);
  console.log(`👤 Authority: ${counter.authority.toBase58()}\n`);

  // 7. Increment
  console.log("─── Incrementing Counter ───");
  for (let i = 0; i < 3; i++) {
    const tx = await program.methods
      .increment()
      .accounts({
        authority: wallet.publicKey,
      })
      .rpc();

    counter = await program.account.counter.fetch(counterPda);
    console.log(`  ✅ Increment #${i + 1} → Count: ${counter.count} | Tx: ${tx.slice(0, 20)}...`);
  }

  // 8. Set value
  console.log("\n─── Setting Counter to 100 ───");
  const setTx = await program.methods
    .set(new anchor.BN(100))
    .accounts({
      authority: wallet.publicKey,
    })
    .rpc();

  counter = await program.account.counter.fetch(counterPda);
  console.log(`✅ Counter set to ${counter.count} | Tx: ${setTx.slice(0, 20)}...`);

  // 9. Decrement
  console.log("\n─── Decrementing Counter ───");
  const decTx = await program.methods
    .decrement()
    .accounts({
      authority: wallet.publicKey,
    })
    .rpc();

  counter = await program.account.counter.fetch(counterPda);
  console.log(`✅ Counter decremented to ${counter.count} | Tx: ${decTx.slice(0, 20)}...`);

  console.log("\n🎉 All operations completed!");
  console.log(`   Explorer: https://explorer.solana.com/address/${program.programId.toBase58()}?cluster=devnet`);
}

main().catch(console.error);
