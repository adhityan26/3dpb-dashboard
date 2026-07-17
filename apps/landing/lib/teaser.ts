import { hitungKalkulasiV2, type KalkulasiInputV2, type HasilKalkulasiV2 } from "@3pb/kalkulator-core";
import { defaultSettings, DEFAULT_MATERIAL, DEFAULT_MESIN_PER_JAM } from "./default-settings";
export { defaultSettings };

export interface TeaserInput { gramasi: number; durasiJam: number; tipe: "FDM" | "SLA" }

export function buildTeaserInputV2(t: TeaserInput): KalkulasiInputV2 {
  const m = DEFAULT_MATERIAL[t.tipe];
  return {
    plates: [{
      durasiJam: t.durasiJam,
      mesinPerJam: DEFAULT_MESIN_PER_JAM,
      mesinPerJamJual: DEFAULT_MESIN_PER_JAM,
      materials: [{ gramasi: t.gramasi, hppPerGram: m.hppPerGram, jualPerGram: m.jualPerGram, failureRatePct: m.failureRatePct }],
    }],
    batch: 1,
    komponen: [],
    labor: [],
  };
}

export function computeTeaser(t: TeaserInput): HasilKalkulasiV2 {
  return hitungKalkulasiV2(buildTeaserInputV2(t), defaultSettings);
}

export interface TeaserView {
  biayaModal: number; hargaJualMinimum: number; rekomendasi: number;
  offlineABC: [number, number, number]; shopeeABC: [number, number, number];
}
export function teaserView(t: TeaserInput): TeaserView {
  const h = computeTeaser(t);
  const off = h.hargaPerChannel.find(c => c.channelId === "offline")!;
  const shop = h.hargaPerChannel.find(c => c.channelId === "shopee")!;
  const r = Math.round;
  return {
    biayaModal: r(h.hppTotal),
    hargaJualMinimum: r(h.floorPrice),
    rekomendasi: r(off.B),
    offlineABC: [r(off.A), r(off.B), r(off.C)],
    shopeeABC: [r(shop.A), r(shop.B), r(shop.C)],
  };
}
