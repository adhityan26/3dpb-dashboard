import { describe, it, expect } from "vitest";
import { hitungKalkulasiV2 } from "@3pb/kalkulator-core";
import { buildInputV2, compute, fullView, defaultSettings } from "@/lib/kalkulator/compute";
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
