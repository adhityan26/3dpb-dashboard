import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings, resetSettings } from "@/lib/store/local-settings";

beforeEach(async () => {
  // Clear all test data by deleting the entire database
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("slizebiz-local");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe("local-settings store", () => {
  it(
    "load tanpa record → default",
    async () => {
      expect(await loadSettings("u1")).toEqual(DEFAULT_LOCAL_SETTINGS);
    },
    10000
  );
  it(
    "save → load roundtrip",
    async () => {
      const s = { ...DEFAULT_LOCAL_SETTINGS, mesinPerJam: 7000 };
      await saveSettings("u1", s);
      expect((await loadSettings("u1")).mesinPerJam).toBe(7000);
    },
    10000
  );
  it(
    "dua userId terpisah",
    async () => {
      await saveSettings("u1", { ...DEFAULT_LOCAL_SETTINGS, mesinPerJam: 7000 });
      expect((await loadSettings("u2")).mesinPerJam).toBe(
        DEFAULT_LOCAL_SETTINGS.mesinPerJam
      );
    },
    10000
  );
  it(
    "reset → default",
    async () => {
      await saveSettings("u1", { ...DEFAULT_LOCAL_SETTINGS, mesinPerJam: 7000 });
      await resetSettings("u1");
      expect(await loadSettings("u1")).toEqual(DEFAULT_LOCAL_SETTINGS);
    },
    10000
  );
});
