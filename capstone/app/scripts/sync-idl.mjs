import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = path.resolve(appRoot, "..", "target");
const dest = path.join(appRoot, "src", "idl");

await mkdir(dest, { recursive: true });
const files = [
  ["idl", "roofic.json"],
  ["types", "roofic.ts"],
];
for (const [dir, name] of files) {
  await copyFile(path.join(targetRoot, dir, name), path.join(dest, name));
}
