import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public", "icon.svg"));

const sizes = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
];

for (const [name, size] of sizes) {
  const out = join(root, "public", name);
  await sharp(svg)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(out);
  console.log(`wrote ${name}`);
}
