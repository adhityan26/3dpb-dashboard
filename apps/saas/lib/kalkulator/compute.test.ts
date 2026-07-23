import { describe, it, expect } from "vitest";
import { hitungKalkulasiV2 } from "@3pb/kalkulator-core";
import { buildInputV2, compute, fullView, defaultSettings, type CalcPlate } from "@/lib/kalkulator/compute";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

const sample = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };

describe("compute parity", () => {
  it("compute == hitungKalkulasiV2(buildInputV2, defaultSettings)", () => {
    const direct = hitungKalkulasiV2(buildInputV2(sample), defaultSettings);
    expect(compute(sample)).toEqual(direct);
  });
});

describe("fullView", () => {
  it("biayaModal = round(hppTotal), hargaJualMinimum = round(floorPrice)", () => {
    const h = compute(sample);
    const v = fullView(sample);
    expect(v.biayaModal).toBe(Math.round(h.hppTotal));
    expect(v.hargaJualMinimum).toBe(Math.round(h.floorPrice));
  });
  it("rekomendasi = round(offline.B)", () => {
    const h = compute(sample);
    const off = h.hargaPerChannel.find((c) => c.channelId === "offline")!;
    expect(fullView(sample).rekomendasi).toBe(Math.round(off.B));
  });
  it("channels: offline + shopee dengan nama dari settings", () => {
    const v = fullView(sample);
    expect(v.channels.map((c) => c.channelId)).toEqual(["offline", "shopee"]);
    expect(v.channels[0].nama).toBe("Offline");
    expect(v.channels[1].nama).toBe("Shopee");
  });
  it("angka channel dibulatkan", () => {
    const v = fullView(sample);
    for (const c of v.channels) {
      expect(Number.isInteger(c.A)).toBe(true);
      expect(Number.isInteger(c.B)).toBe(true);
      expect(Number.isInteger(c.C)).toBe(true);
    }
  });
});

describe("compute custom settings", () => {
  const sample = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };
  it("parity: fullView(c) === fullView(c, DEFAULT_LOCAL_SETTINGS)", () => {
    expect(fullView(sample)).toEqual(fullView(sample, DEFAULT_LOCAL_SETTINGS));
  });
  it("naikkan margin.A → offline.A ikut naik", () => {
    const base = fullView(sample);
    const custom = { ...DEFAULT_LOCAL_SETTINGS, margin: { ...DEFAULT_LOCAL_SETTINGS.margin, A: DEFAULT_LOCAL_SETTINGS.margin.A + 1 } };
    const hi = fullView(sample, custom);
    const offBase = base.channels.find((c) => c.channelId === "offline")!.A;
    const offHi = hi.channels.find((c) => c.channelId === "offline")!.A;
    expect(offHi).toBeGreaterThan(offBase);
  });
  it("material custom (hpp FDM naik) → biaya modal naik", () => {
    const custom = { ...DEFAULT_LOCAL_SETTINGS, material: { ...DEFAULT_LOCAL_SETTINGS.material, FDM: { ...DEFAULT_LOCAL_SETTINGS.material.FDM, hppPerGram: DEFAULT_LOCAL_SETTINGS.material.FDM.hppPerGram + 500 } } };
    expect(fullView(sample, custom).biayaModal).toBeGreaterThan(fullView(sample).biayaModal);
  });
});

describe("1b-2 add-on + rincian", () => {
  const base = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };
  it("tanpa add-on → parity (invariant)", () => {
    expect(fullView(base)).toEqual(fullView({ ...base }, DEFAULT_LOCAL_SETTINGS));
  });
  it("komponen naikkan biaya modal & floor persis", () => {
    const a = fullView(base);
    const b = fullView({ ...base, komponen: [{ id: "1", nama: "Baut", harga: 1000, qty: 2 }] }, DEFAULT_LOCAL_SETTINGS);
    expect(b.biayaModal - a.biayaModal).toBe(2000);
    expect(b.hargaJualMinimum - a.hargaJualMinimum).toBe(2000);
  });
  it("labor + packing naikkan biaya modal", () => {
    const a = fullView(base);
    const b = fullView({ ...base, labor: [{ id: "1", nama: "Cat", jam: 1, ratePerJam: 10000 }], packing: { nama: "Box", harga: 2500 } }, DEFAULT_LOCAL_SETTINGS);
    expect(b.biayaModal - a.biayaModal).toBe(12500);
  });
  it("rincian: produksi+komponen+packing+labor == biayaModal", () => {
    const v = fullView({ ...base, komponen: [{ id: "1", nama: "Baut", harga: 1000, qty: 1 }], labor: [{ id: "2", nama: "Cat", flat: 5000 }], packing: { nama: "Box", harga: 2500 } }, DEFAULT_LOCAL_SETTINGS);
    expect(v.rincian.packing).toBe(2500);
    expect(v.rincian.komponen).toBe(1000);
    expect(v.rincian.labor).toBe(5000);
    expect(v.rincian.produksi + v.rincian.komponen + v.rincian.packing + v.rincian.labor).toBe(v.rincian.biayaModal);
  });
});

describe("1b-3 multi-plate + batch", () => {
  const p = (over: Partial<CalcPlate> = {}): CalcPlate => ({ id: "x", tipe: "FDM", gramasi: 50, durasiJam: 3, ...over });

  it("plates[] menghasilkan N plate di output V2", () => {
    const out = buildInputV2({ plates: [p(), p({ id: "y", gramasi: 30 }), p({ id: "z", tipe: "SLA", gramasi: 20 })] });
    expect(out.plates).toHaveLength(3);
    expect(out.plates[0].materials[0].gramasi).toBe(50);
    expect(out.plates[2].materials[0].gramasi).toBe(20);
    // plate SLA memakai rate material SLA dari settings
    expect(out.plates[2].materials[0].hppPerGram).toBe(DEFAULT_LOCAL_SETTINGS.material.SLA.hppPerGram);
  });

  it("nama plate → namaPart (dan diabaikan bila kosong)", () => {
    const out = buildInputV2({ plates: [p({ nama: "Face" }), p({ id: "y" })] });
    expect(out.plates[0].namaPart).toBe("Face");
    expect(out.plates[1].namaPart).toBeUndefined();
  });

  it("batch diteruskan & di-sanitasi (>=1, NaN/undefined → 1)", () => {
    expect(buildInputV2({ plates: [p()], batch: 4 }).batch).toBe(4);
    expect(buildInputV2({ plates: [p()], batch: 0 }).batch).toBe(1);
    expect(buildInputV2({ plates: [p()], batch: -2 }).batch).toBe(1);
    expect(buildInputV2({ plates: [p()] }).batch).toBe(1);
  });

  it("parity: plates single == jalur legacy flat (angka identik)", () => {
    const viaPlate = fullView({ plates: [p({ gramasi: 50, durasiJam: 3, tipe: "FDM" })] });
    const viaLegacy = fullView({ gramasi: 50, durasiJam: 3, tipe: "FDM" });
    expect(viaPlate).toEqual(viaLegacy);
  });

  it("dua plate [50,50] == satu plate 100g/6jam (core linear)", () => {
    const two = fullView({ plates: [p({ gramasi: 50, durasiJam: 3 }), p({ id: "y", gramasi: 50, durasiJam: 3 })] });
    const one = fullView({ gramasi: 100, durasiJam: 6, tipe: "FDM" });
    expect(two.biayaModal).toBe(one.biayaModal);
    expect(two.hargaJualMinimum).toBe(one.hargaJualMinimum);
  });

  it("batch 2 pada dua plate identik membagi produksi", () => {
    const b1 = fullView({ plates: [p(), p({ id: "y" })], batch: 1 });
    const b2 = fullView({ plates: [p(), p({ id: "y" })], batch: 2 });
    expect(b2.rincian.produksi).toBe(Math.round(b1.rincian.produksi / 2));
  });
});

describe("fullView.strategi (redesign)", () => {
  const base = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };
  it("harga per tier = ceil500 dari channel; ada offline & shopee", () => {
    const v = fullView(base);
    expect(v.strategi.offline).toBeTruthy();
    expect(v.strategi.shopee).toBeTruthy();
    for (const t of ["A", "B", "C"] as const) {
      const off = v.channels.find((c) => c.channelId === "offline")!;
      expect(v.strategi.offline[t].harga).toBe(Math.ceil(off[t] / 500) * 500);
    }
  });
  it("laba offline (fee 1) = harga − biaya modal", () => {
    const v = fullView(base);
    const cell = v.strategi.offline.B;
    expect(cell.laba).toBe(Math.round(cell.harga - v.biayaModal));
    expect(cell.marginPct).toBeCloseTo(Math.round((cell.laba / cell.harga) * 1000) / 10, 5);
  });
  it("shopee (fee 1.2) pakai net = harga/1.2 untuk laba", () => {
    const v = fullView(base);
    const cell = v.strategi.shopee.B;
    const net = cell.harga / 1.2;
    expect(cell.laba).toBe(Math.round(net - v.biayaModal));
  });
});

describe("1b-6a multi-material", () => {
  const p = (over = {}): CalcPlate => ({ id: "x", tipe: "FDM", gramasi: 50, durasiJam: 3, ...over });

  it("paritas: plate 1 material tanpa filamentId == perilaku legacy", () => {
    const legacy = buildInputV2({ plates: [p()] });
    const viaMaterials = buildInputV2({ plates: [{ id: "x", durasiJam: 3, materials: [{ tipe: "FDM", gramasi: 50 }] }] });
    expect(viaMaterials.plates[0].materials).toEqual(legacy.plates[0].materials);
  });

  it("plate 2 material dari katalog: gram & tarif per material dari filaments", () => {
    const ls = DEFAULT_LOCAL_SETTINGS;
    const out = buildInputV2({ plates: [{
      id: "x", durasiJam: 3, materials: [
        { filamentId: "fil-pla-putih", tipe: "FDM", gramasi: 40 },
        { filamentId: "fil-resin-abu", tipe: "SLA", gramasi: 10 },
      ],
    }] }, ls);
    expect(out.plates[0].materials).toHaveLength(2);
    expect(out.plates[0].materials[0]).toMatchObject({ gramasi: 40, hppPerGram: 300, jualPerGram: 900 });
    expect(out.plates[0].materials[1]).toMatchObject({ gramasi: 10, hppPerGram: 1750, jualPerGram: 3500 });
  });

  it("filamentId tak dikenal → fallback material[tipe]", () => {
    const out = buildInputV2({ plates: [{ id: "x", durasiJam: 3, materials: [{ filamentId: "tidak-ada", tipe: "SLA", gramasi: 20 }] }] }, DEFAULT_LOCAL_SETTINGS);
    expect(out.plates[0].materials[0]).toMatchObject({
      gramasi: 20,
      hppPerGram: DEFAULT_LOCAL_SETTINGS.material.SLA.hppPerGram,
      jualPerGram: DEFAULT_LOCAL_SETTINGS.material.SLA.jualPerGram,
    });
  });
});
