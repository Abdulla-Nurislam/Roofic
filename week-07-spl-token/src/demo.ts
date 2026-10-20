// ============================================================================
// Полный сценарий недели 7 одной командой + проверки (assert).
// Используется как интеграционный тест на локальном валидаторе:
//   solana-test-validator -r   (в отдельном терминале)
//   CLUSTER=localnet npm run demo
// ============================================================================
import assert from "node:assert/strict";
import { TOKEN_2022_PROGRAM_ID, getAccount, getMint, getTokenMetadata } from "@solana/spl-token";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { CLUSTER, TOKEN, connection, payer, toBaseUnits } from "./common.js";
import { createMint } from "./01-create-mint.js";
import { INITIAL_SUPPLY, mintTokens } from "./02-mint-to.js";
import { transferTokens } from "./03-transfer.js";
import { collectFees } from "./04-collect-fees.js";
import { updateMetadata } from "./05-update-metadata.js";
import { inspect } from "./06-inspect.js";

async function main() {
  if (CLUSTER === "localnet" && (await connection.getBalance(payer.publicKey)) < LAMPORTS_PER_SOL) {
    await connection.confirmTransaction(await connection.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL));
  }

  const mint = await createMint();
  await mintTokens();
  const amount = 10_000;
  const { destination, fee } = await transferTokens(amount);
  const collected = await collectFees();
  await updateMetadata("website", "https://github.com/Abdulla-Nurislam");
  await inspect();

  // ---------------- Проверки ----------------
  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  assert.equal(mintInfo.supply, toBaseUnits(INITIAL_SUPPLY), "supply");
  assert.equal(fee, (toBaseUnits(amount) * BigInt(TOKEN.feeBasisPoints)) / 10_000n, "fee = 0.5%");

  const dest = await getAccount(connection, destination, "confirmed", TOKEN_2022_PROGRAM_ID);
  assert.equal(dest.amount, toBaseUnits(amount) - fee, "получатель получает сумму за вычетом комиссии");
  assert.equal(collected, fee, "в казну выведена вся комиссия");

  const md = await getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  assert.equal(md?.symbol, TOKEN.symbol);
  assert.ok(md?.additionalMetadata.some(([k]) => k === "website"), "новое поле metadata");

  console.log("\n🎉 Все проверки пройдены");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
