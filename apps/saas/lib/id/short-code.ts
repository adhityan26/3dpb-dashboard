import crypto from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Client Prisma yang cukup buat cek collision — `prisma` global ATAU `tx` interactive transaction. */
type ShortCodeDbClient = Pick<Prisma.TransactionClient, "device">;

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

/**
 * Generate shortCode unik global (dicek terhadap Device.shortCode), retry maks 3x kalau collision.
 *
 * `client` WAJIB diisi `tx` bila dipanggil dari dalam interactive transaction (lihat createDevice
 * di lib/devices/service.ts). Kalau tidak, query cek-collision ini ambil koneksi KEDUA dari pool
 * sementara transaksinya masih memegang row-lock `FOR UPDATE` pada Entitlement — di bawah
 * konkurensi, tiap transaksi yang in-flight jadi saling menunggu slot pool yang dipegang transaksi
 * lain yang juga sedang menunggu (deadlock pool). Ini persis anti-pattern yang sudah sengaja
 * dihindari untuk `getConfigInt` di createDevice.
 */
export async function generateUniqueShortCode(client: ShortCodeDbClient = prisma): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomShortCode();
    const existing = await client.device.findUnique({ where: { shortCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("gagal generate shortCode unik setelah 3 percobaan");
}
