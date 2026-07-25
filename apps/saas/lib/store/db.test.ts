import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { openLocalDb, DB_NAME } from "./db";

beforeEach(async () => {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe("db shared opener", () => {
  it(
    "membuat store settings & kalkulasi + index by-userId",
    async () => {
      const database = await openLocalDb();
      expect(database.objectStoreNames.contains("settings")).toBe(true);
      expect(database.objectStoreNames.contains("kalkulasi")).toBe(true);
      const tx = database.transaction("kalkulasi", "readonly");
      expect(tx.store.indexNames.contains("by-userId")).toBe(true);
      database.close();
    },
    10000
  );

  it(
    "upgrade dari DB versi 1 (store settings sudah ada + berisi data) tetap tambah kalkulasi tanpa merusak data lama",
    async () => {
      const { openDB } = await import("idb");
      const v1 = await openDB(DB_NAME, 1, {
        upgrade(d) {
          d.createObjectStore("settings", { keyPath: "userId" });
        },
      });
      await v1.put("settings", { userId: "u1", settings: { mesinPerJam: 9999 } });
      v1.close();

      const database = await openLocalDb();
      expect(database.objectStoreNames.contains("kalkulasi")).toBe(true);
      const rec = await database.get("settings", "u1");
      expect((rec as { settings: { mesinPerJam: number } }).settings.mesinPerJam).toBe(9999);
      database.close();
    },
    10000
  );
});
