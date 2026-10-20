// ============================================================================
// Шаг 6. Инспекция токена: всё, что можно прочитать on-chain
// ============================================================================
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getExtensionTypes,
  getMetadataPointerState,
  getMint,
  getTokenMetadata,
  getTransferFeeConfig,
} from "@solana/spl-token";
import { TOKEN, connection, explorer, fromBaseUnits, header, readState, requireMint, runIfMain } from "./common.js";

export async function inspect() {
  header("6. Inspect ROOF token");
  const mint = requireMint();
  const info = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);

  console.log(`Mint:            ${mint.toBase58()}`);
  console.log(`Program:         Token-2022 (${TOKEN_2022_PROGRAM_ID.toBase58()})`);
  console.log(`Supply:          ${fromBaseUnits(info.supply)} ${TOKEN.symbol}`);
  console.log(`Decimals:        ${info.decimals}`);
  console.log(`Mint authority:  ${info.mintAuthority?.toBase58() ?? "— (fixed supply)"}`);
  console.log(`Extensions:      ${getExtensionTypes(info.tlvData).map((e) => ExtensionType[e]).join(", ")}`);

  const fee = getTransferFeeConfig(info);
  if (fee) {
    console.log(`Transfer fee:    ${fee.newerTransferFee.transferFeeBasisPoints / 100}% (max ${fromBaseUnits(fee.newerTransferFee.maximumFee)})`);
    console.log(`Withheld (mint): ${fromBaseUnits(fee.withheldAmount)}`);
  }
  const pointer = getMetadataPointerState(info);
  console.log(`Metadata ptr:    ${pointer?.metadataAddress?.toBase58()}`);

  const md = await getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log(`Metadata:        ${md?.name} (${md?.symbol}) → ${md?.uri}`);
  for (const [k, v] of md?.additionalMetadata ?? []) console.log(`                 ${k} = ${v}`);

  const holders = await connection.getTokenLargestAccounts(mint);
  console.log("Holders:");
  for (const h of holders.value) console.log(`   ${h.address.toBase58()}  ${h.uiAmountString}`);

  console.log(`\nExplorer: ${explorer("address", mint.toBase58())}`);
  const { signatures } = readState();
  for (const [step, sig] of Object.entries(signatures ?? {})) console.log(`   ${step.padEnd(24)} ${explorer("tx", sig)}`);
}

runIfMain(import.meta.url, inspect);
