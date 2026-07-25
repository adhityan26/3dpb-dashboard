import { openLocalDb } from "./db";
import type { PlateRow } from "@/components/PlateInput";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";
import type { MarginTier, HasilKalkulasiV2 } from "@3pb/kalkulator-core";
import type { Strategi } from "@/lib/kalkulator/compute";

const STORE = "kalkulasi";

export interface KalkulasiInput {
  plates: PlateRow[];
  batch: string;
  komponen: KomponenRow[];
  labor: LaborRow[];
  packing?: { nama: string; harga: number };
  channel: string;
  tier: MarginTier;
}

export interface KalkulasiSnapshot {
  biayaModal: number;
  hargaJualMinimum: number;
  rekomendasi: number;
  status: HasilKalkulasiV2["status"];
  strategi: Strategi;
}

export interface KalkulasiRecord {
  id: string;
  userId: string;
  nama: string;
  createdAt: string;
  updatedAt: string;
  input: KalkulasiInput;
  snapshot: KalkulasiSnapshot;
}

/** Urut updatedAt desc (terbaru dulu). */
export async function listKalkulasi(userId: string): Promise<KalkulasiRecord[]> {
  const database = await openLocalDb();
  try {
    const all = (await database.getAllFromIndex(STORE, "by-userId", userId)) as KalkulasiRecord[];
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    database.close();
  }
}

export async function getKalkulasi(userId: string, id: string): Promise<KalkulasiRecord | null> {
  const database = await openLocalDb();
  try {
    const rec = (await database.get(STORE, id)) as KalkulasiRecord | undefined;
    if (!rec || rec.userId !== userId) return null;
    return rec;
  } finally {
    database.close();
  }
}

/** Create ATAU update (put by id). */
export async function putKalkulasi(record: KalkulasiRecord): Promise<void> {
  const database = await openLocalDb();
  try {
    await database.put(STORE, record);
  } finally {
    database.close();
  }
}

export async function deleteKalkulasi(userId: string, id: string): Promise<void> {
  const database = await openLocalDb();
  try {
    const rec = (await database.get(STORE, id)) as KalkulasiRecord | undefined;
    if (!rec || rec.userId !== userId) return;
    await database.delete(STORE, id);
  } finally {
    database.close();
  }
}
