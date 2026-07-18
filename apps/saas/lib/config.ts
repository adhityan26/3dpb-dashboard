import { prisma } from "@/lib/db";

/** Default konstanta — dipakai bila key absen di DB (landing/teaser/modal tetap render). */
export const DEFAULT_CONFIG: Record<string, string> = {
  "price.beli": "",              // TBA (angka pricing ditunda — funnel §3.7)
  "price.sub.owner": "",
  "price.sub.standalone": "",
  "copy.hero.headline": "Hitung harga jual produk 3D print-mu dalam hitungan detik",
  "feature.pos.status": "segera-hadir",
};

/** Parse harga; kembalikan null bila non-numerik/kosong (biar caller fallback). */
export function parsePrice(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export async function getConfig(key: string): Promise<string> {
  const row = await prisma.config.findUnique({ where: { key } });
  if (row) return row.value;
  return DEFAULT_CONFIG[key] ?? "";
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await prisma.config.findMany();
  const merged: Record<string, string> = { ...DEFAULT_CONFIG };
  for (const r of rows) merged[r.key] = r.value;
  return merged;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
