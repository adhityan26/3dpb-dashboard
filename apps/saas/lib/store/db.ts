import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "slizebiz-local";
export const DB_VERSION = 2;

/** Satu opener bersama untuk seluruh store lokal (settings, kalkulasi, ...) —
 *  upgrade idempoten per-store (cek objectStoreNames.contains) supaya aman
 *  dipanggil dari modul manapun tanpa peduli urutan/versi DB yang ada sekarang. */
export async function openLocalDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("settings")) {
        d.createObjectStore("settings", { keyPath: "userId" });
      }
      if (!d.objectStoreNames.contains("kalkulasi")) {
        const store = d.createObjectStore("kalkulasi", { keyPath: "id" });
        store.createIndex("by-userId", "userId");
      }
    },
  });
}
