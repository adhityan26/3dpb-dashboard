import { describe, it, expect } from "vitest";
import { defaultSettings } from "@/lib/kalkulator/default-settings";
import { DEFAULT_LOCAL_SETTINGS, toSettingsV2, validateLocalSettings, newFilamentEntry, freeTierSettings, type LocalSettings } from "@/lib/kalkulator/local-settings";

describe("toSettingsV2 parity", () => {
  it("DEFAULT_LOCAL_SETTINGS → deep-equal defaultSettings existing", () => {
    expect(toSettingsV2(DEFAULT_LOCAL_SETTINGS)).toEqual(defaultSettings);
  });
  it("reflect margin.A + channel.shopee + failureSpread", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, margin: { A: 1.3, B: 1.5, C: 2 }, channels: { offline: 1, shopee: 1.5 }, failureSpreadPct: 70 };
    const s = toSettingsV2(ls);
    expect(s.marginMultipliers.A).toBe(1.3);
    expect(s.channels.find((c) => c.id === "shopee")!.feeMultiplier).toBe(1.5);
    expect(s.failureSpreadPct).toBe(70);
  });
});

describe("validateLocalSettings", () => {
  it("default valid → []", () => { expect(validateLocalSettings(DEFAULT_LOCAL_SETTINGS)).toEqual([]); });
  it("hpp ≤ 0 → error", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, material: { ...DEFAULT_LOCAL_SETTINGS.material, FDM: { ...DEFAULT_LOCAL_SETTINGS.material.FDM, hppPerGram: 0 } } };
    expect(validateLocalSettings(ls).length).toBeGreaterThan(0);
  });
  it("failure > 100 → error", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, material: { ...DEFAULT_LOCAL_SETTINGS.material, SLA: { ...DEFAULT_LOCAL_SETTINGS.material.SLA, failureRatePct: 150 } } };
    expect(validateLocalSettings(ls).length).toBeGreaterThan(0);
  });
  it("fee < 1 → error", () => {
    expect(validateLocalSettings({ ...DEFAULT_LOCAL_SETTINGS, channels: { offline: 0.5, shopee: 1.2 } }).length).toBeGreaterThan(0);
  });
  it("reseller ≤ 0 → error", () => {
    expect(validateLocalSettings({ ...DEFAULT_LOCAL_SETTINGS, resellerBulkMultiplier: 0 }).length).toBeGreaterThan(0);
  });
});

describe("1b-2 preset komponen/packing/labor-bundle", () => {
  it("toSettingsV2 tetap paritas (invariant 1b-1)", () => {
    expect(toSettingsV2(DEFAULT_LOCAL_SETTINGS)).toEqual(defaultSettings);
  });
  it("DEFAULT: 6 komponen, 4 packing, 3 labor bundle (tiap bundle punya item)", () => {
    expect(DEFAULT_LOCAL_SETTINGS.komponenPresets).toHaveLength(6);
    expect(DEFAULT_LOCAL_SETTINGS.packingPresets).toHaveLength(4);
    expect(DEFAULT_LOCAL_SETTINGS.laborPresets).toHaveLength(3);
    expect(DEFAULT_LOCAL_SETTINGS.laborPresets[1]).toMatchObject({ nama: "Finishing Standar" });
    expect(DEFAULT_LOCAL_SETTINGS.laborPresets[1].items).toHaveLength(3);
    expect(DEFAULT_LOCAL_SETTINGS.packingPresets[0]).toMatchObject({ nama: "Packing S", harga: 1500 });
  });
  it("DEFAULT valid", () => { expect(validateLocalSettings(DEFAULT_LOCAL_SETTINGS)).toEqual([]); });
  it("validate tangkap komponen/packing invalid", () => {
    const bad = structuredClone(DEFAULT_LOCAL_SETTINGS);
    bad.komponenPresets[0].harga = 0;
    bad.packingPresets[0].nama = "  ";
    const e = validateLocalSettings(bad);
    expect(e.some((x) => /komponen/i.test(x))).toBe(true);
    expect(e.some((x) => /packing/i.test(x))).toBe(true);
  });
  it("validate tangkap labor bundle kosong item & item biaya 0", () => {
    const bad = structuredClone(DEFAULT_LOCAL_SETTINGS);
    bad.laborPresets[0].items = [];
    bad.laborPresets[1].items[0] = { nama: "Nol", jam: 0, ratePerJam: 0, flat: 0 };
    const e = validateLocalSettings(bad);
    expect(e.filter((x) => /labor/i.test(x)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("laborJobs katalog", () => {
  it("default berisi Assembly/Sanding/Painting dengan tarif", () => {
    const namas = DEFAULT_LOCAL_SETTINGS.laborJobs.map((j) => j.nama);
    expect(namas).toEqual(expect.arrayContaining(["Assembly", "Sanding", "Painting"]));
    const painting = DEFAULT_LOCAL_SETTINGS.laborJobs.find((j) => j.nama === "Painting")!;
    expect(painting.ratePerJam).toBe(75000);
  });
  it("validate menolak job tarif negatif", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, laborJobs: [{ id: "x", nama: "X", ratePerJam: -1 }] };
    expect(validateLocalSettings(bad)).toContain('Pekerjaan "X" tarif negatif');
  });
  it("validate menolak job nama kosong", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, laborJobs: [{ id: "x", nama: "  ", ratePerJam: 100 }] };
    expect(validateLocalSettings(bad).some((e) => /Pekerjaan #1 nama kosong/.test(e))).toBe(true);
  });
  it("validate menolak nama pekerjaan dobel (case-insensitive)", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, laborJobs: [
      { id: "a", nama: "Painting", ratePerJam: 75000 },
      { id: "b", nama: "painting", ratePerJam: 50000 },
    ] };
    expect(validateLocalSettings(bad).some((e) => /nama harus unik/.test(e))).toBe(true);
  });
});

describe("1b-6a filament catalog", () => {
  it("DEFAULT punya minimal 3 filament valid", () => {
    expect(DEFAULT_LOCAL_SETTINGS.filaments.length).toBeGreaterThanOrEqual(3);
    expect(validateLocalSettings(DEFAULT_LOCAL_SETTINGS)).toEqual([]);
  });

  it("newFilamentEntry: baris kosong murni (id \"\" diisi caller via newId), tipe FDM default", () => {
    const f = newFilamentEntry();
    expect(f).toMatchObject({ id: "", brand: "", material: "", warna: "", tipe: "FDM", hppPerGram: 0, jualPerGram: 0 });
  });

  it("menolak filament harga modal / jual ≤ 0", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, filaments: [
      { id: "f1", brand: "A", material: "PLA", tipe: "FDM", warna: "Putih", hppPerGram: 0, jualPerGram: 500 },
    ] };
    expect(validateLocalSettings(bad).some((e) => /harga modal|modal.*> 0|hpp/i.test(e))).toBe(true);
  });

  it("menolak warnaHex tidak valid", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, filaments: [
      { id: "f1", brand: "A", material: "PLA", tipe: "FDM", warna: "Putih", warnaHex: "bukan-hex", hppPerGram: 300, jualPerGram: 500 },
    ] };
    expect(validateLocalSettings(bad).some((e) => /warna|hex/i.test(e))).toBe(true);
  });

  it("menolak filament identitas duplikat (brand+material+warna)", () => {
    const dup = { brand: "eSUN", material: "PLA", tipe: "FDM" as const, warna: "Putih", hppPerGram: 300, jualPerGram: 500 };
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, filaments: [
      { id: "f1", ...dup }, { id: "f2", ...dup },
    ] };
    expect(validateLocalSettings(bad).some((e) => /sama|unik|duplik/i.test(e))).toBe(true);
  });

  it("menerima katalog filament kosong", () => {
    const empty: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, filaments: [] };
    expect(validateLocalSettings(empty)).toEqual([]);
  });
});

describe("freeTierSettings (buka section Harga jual untuk Free, sisanya tetap default)", () => {
  const saved: LocalSettings = {
    ...DEFAULT_LOCAL_SETTINGS,
    material: {
      FDM: { hppPerGram: 1, jualPerGram: 999, failureRatePct: 1 },
      SLA: { hppPerGram: 1, jualPerGram: 888, failureRatePct: 1 },
    },
    mesinPerJam: 1,
    failureSpreadPct: 1,
    testLayerPct: 1,
    margin: { A: 1.11, B: 1.22, C: 1.33 },
    resellerBulkMultiplier: 0.5,
    channels: { offline: 2, shopee: 3 },
    komponenPresets: [{ id: "tampered", nama: "hasil tamper", harga: 1 }],
    filaments: [],
  };

  it("8 field section Harga jual diambil dari data tersimpan", () => {
    const r = freeTierSettings(saved);
    expect(r.material.FDM.jualPerGram).toBe(999);
    expect(r.material.SLA.jualPerGram).toBe(888);
    expect(r.margin).toEqual({ A: 1.11, B: 1.22, C: 1.33 });
    expect(r.resellerBulkMultiplier).toBe(0.5);
    expect(r.channels).toEqual({ offline: 2, shopee: 3 });
  });

  it("field di luar Harga jual TETAP default, walau data tersimpan sudah di-tamper", () => {
    const r = freeTierSettings(saved);
    expect(r.material.FDM.hppPerGram).toBe(DEFAULT_LOCAL_SETTINGS.material.FDM.hppPerGram);
    expect(r.material.FDM.failureRatePct).toBe(DEFAULT_LOCAL_SETTINGS.material.FDM.failureRatePct);
    expect(r.material.SLA.hppPerGram).toBe(DEFAULT_LOCAL_SETTINGS.material.SLA.hppPerGram);
    expect(r.mesinPerJam).toBe(DEFAULT_LOCAL_SETTINGS.mesinPerJam);
    expect(r.failureSpreadPct).toBe(DEFAULT_LOCAL_SETTINGS.failureSpreadPct);
    expect(r.testLayerPct).toBe(DEFAULT_LOCAL_SETTINGS.testLayerPct);
    expect(r.komponenPresets).toEqual(DEFAULT_LOCAL_SETTINGS.komponenPresets);
    expect(r.filaments).toEqual(DEFAULT_LOCAL_SETTINGS.filaments);
  });

  it("hasilnya tetap lolos validateLocalSettings (kombinasi default + Harga jual custom valid)", () => {
    expect(validateLocalSettings(freeTierSettings(saved))).toEqual([]);
  });
});
