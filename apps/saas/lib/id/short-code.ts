import crypto from "crypto";
import { prisma } from "@/lib/db";

export const BASE36_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const LENGTH = 10;
const MAX_ATTEMPTS = 3;

function randomShortCode(): string {
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    out += BASE36_ALPHABET[crypto.randomInt(0, BASE36_ALPHABET.length)];
  }
  return out;
}

/** Generate shortCode unik global (dicek terhadap Device.shortCode), retry maks 3x kalau collision. */
export async function generateUniqueShortCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomShortCode();
    const existing = await prisma.device.findUnique({ where: { shortCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("gagal generate shortCode unik setelah 3 percobaan");
}
