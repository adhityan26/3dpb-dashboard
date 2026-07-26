import { describe, it, expect } from "vitest";
import { computeKalkulasiSnapshot } from "./snapshot";
import { fullView } from "./compute";
import { DEFAULT_LOCAL_SETTINGS } from "./local-settings";
import type { KalkulasiInput } from "@/lib/store/kalkulasi-history";

const VALID_INPUT: KalkulasiInput = {
  plates: [{ id: "p1", nama: "", durasiJam: "3", materials: [{ id: "m1", tipe: "FDM", gramasi: "50" }] }],
  batch: "1",
  komponen: [],
  labor: [],
  packing: undefined,
  channel: "offline",
  tier: "B",
};

describe("computeKalkulasiSnapshot", () => {
  it("input valid → snapshot sama dengan fullView untuk plate yang sama", () => {
    const snapshot = computeKalkulasiSnapshot(VALID_INPUT, DEFAULT_LOCAL_SETTINGS);
    const expected = fullView({
      plates: [{ id: "p1", durasiJam: 3, materials: [{ tipe: "FDM", gramasi: 50 }] }],
      batch: 1, komponen: [], labor: [], packing: undefined,
    }, DEFAULT_LOCAL_SETTINGS);
    expect(snapshot).toEqual({
      biayaModal: expected.biayaModal,
      hargaJualMinimum: expected.hargaJualMinimum,
      rekomendasi: expected.rekomendasi,
      status: expected.status,
      strategi: expected.strategi,
    });
  });

  it("plates kosong → null", () => {
    expect(computeKalkulasiSnapshot({ ...VALID_INPUT, plates: [] }, DEFAULT_LOCAL_SETTINGS)).toBeNull();
  });

  it("durasiJam 0 → null", () => {
    const input = { ...VALID_INPUT, plates: [{ ...VALID_INPUT.plates[0], durasiJam: "0" }] };
    expect(computeKalkulasiSnapshot(input, DEFAULT_LOCAL_SETTINGS)).toBeNull();
  });

  it("gramasi 0 → null", () => {
    const input = {
      ...VALID_INPUT,
      plates: [{ ...VALID_INPUT.plates[0], materials: [{ id: "m1", tipe: "FDM" as const, gramasi: "0" }] }],
    };
    expect(computeKalkulasiSnapshot(input, DEFAULT_LOCAL_SETTINGS)).toBeNull();
  });
});
