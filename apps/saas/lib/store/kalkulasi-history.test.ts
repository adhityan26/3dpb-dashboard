import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { DB_NAME } from "./db";
import {
  listKalkulasi,
  getKalkulasi,
  putKalkulasi,
  deleteKalkulasi,
  type KalkulasiRecord,
} from "./kalkulasi-history";

beforeEach(async () => {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

function makeRecord(overrides: Partial<KalkulasiRecord> = {}): KalkulasiRecord {
  return {
    id: "k1",
    userId: "u1",
    nama: "Vas bunga",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    input: {
      plates: [],
      batch: "1",
      komponen: [],
      labor: [],
      packing: undefined,
      channel: "offline",
      tier: "B",
    },
    snapshot: {
      biayaModal: 1000,
      hargaJualMinimum: 1500,
      rekomendasi: 2000,
      status: "AMAN",
      strategi: {},
    },
    ...overrides,
  } as KalkulasiRecord;
}

describe("kalkulasi-history store", () => {
  it(
    "put → get roundtrip",
    async () => {
      await putKalkulasi(makeRecord());
      const rec = await getKalkulasi("u1", "k1");
      expect(rec?.nama).toBe("Vas bunga");
    },
    10000
  );

  it(
    "list urut updatedAt desc",
    async () => {
      await putKalkulasi(makeRecord({ id: "k1", updatedAt: "2026-01-01T00:00:00.000Z" }));
      await putKalkulasi(makeRecord({ id: "k2", updatedAt: "2026-01-03T00:00:00.000Z" }));
      await putKalkulasi(makeRecord({ id: "k3", updatedAt: "2026-01-02T00:00:00.000Z" }));
      const list = await listKalkulasi("u1");
      expect(list.map((r) => r.id)).toEqual(["k2", "k3", "k1"]);
    },
    10000
  );

  it(
    "delete beneran hilang",
    async () => {
      await putKalkulasi(makeRecord());
      await deleteKalkulasi("u1", "k1");
      expect(await getKalkulasi("u1", "k1")).toBeNull();
      expect(await listKalkulasi("u1")).toEqual([]);
    },
    10000
  );

  it(
    "scoping userId — record user lain tak ke-return/ke-delete",
    async () => {
      await putKalkulasi(makeRecord({ id: "k1", userId: "u1" }));
      await putKalkulasi(makeRecord({ id: "k2", userId: "u2" }));
      expect(await getKalkulasi("u2", "k1")).toBeNull();
      expect(await listKalkulasi("u2")).toHaveLength(1);
      await deleteKalkulasi("u2", "k1");
      expect(await getKalkulasi("u1", "k1")).not.toBeNull();
    },
    10000
  );

  it(
    "upgrade dari DB versi 1 (settings sudah ada+berisi data) tak merusak data lama",
    async () => {
      const { openDB } = await import("idb");
      const v1 = await openDB(DB_NAME, 1, {
        upgrade(d) {
          d.createObjectStore("settings", { keyPath: "userId" });
        },
      });
      await v1.put("settings", { userId: "u1", settings: { mesinPerJam: 9999 } });
      v1.close();

      const records = await listKalkulasi("u1");
      expect(records).toEqual([]);

      const { loadSettings } = await import("@/lib/store/local-settings");
      const loaded = await loadSettings("u1");
      expect(loaded.mesinPerJam).toBe(9999);
    },
    10000
  );
});
