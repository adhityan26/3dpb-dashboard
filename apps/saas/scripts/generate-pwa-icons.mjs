#!/usr/bin/env node
// Dijalankan SEKALI secara manual: node scripts/generate-pwa-icons.mjs
// Hasil PNG-nya di-commit ke git — BUKAN bagian build/CI (lihat spec §Manifest & ikon).
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const svgPath = path.join(publicDir, "logo.svg");

async function main() {
  await sharp(svgPath).resize(192, 192).png().toFile(path.join(publicDir, "icon-192.png"));
  await sharp(svgPath).resize(512, 512).png().toFile(path.join(publicDir, "icon-512.png"));

  // Ikon maskable: logo diperkecil ke 320x320 (padding ~20% tiap sisi) di atas kanvas
  // 512x512 solid, supaya tak terpotong area aman adaptive-icon di Android/iOS.
  const logoBuffer = await sharp(svgPath).resize(320, 320).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: "#080818" },
  })
    .composite([{ input: logoBuffer, gravity: "center" }])
    .png()
    .toFile(path.join(publicDir, "icon-maskable-512.png"));

  console.log("Ikon PWA dibuat: icon-192.png, icon-512.png, icon-maskable-512.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
