import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = path.resolve(clientRoot, "..", "target");
const dest = path.join(clientRoot, "idl");

await mkdir(dest, { recursive: true });
for (const name of ["roofic_shares.json", "roofic_portfolio.json"]) {
  await copyFile(path.join(targetRoot, "idl", name), path.join(dest, name));
}
