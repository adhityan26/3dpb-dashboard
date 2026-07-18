import {
  hitungKalkulasiV2,
  type KalkulasiInputV2,
  type HasilKalkulasiV2,
} from "@3pb/kalkulator-core";
import { defaultSettings, DEFAULT_MATERIAL, DEFAULT_MESIN_PER_JAM } from "./default-settings";

export { defaultSettings };

export interface CalcInput {
  gramasi: number;
  durasiJam: number;
  tipe: "FDM" | "SLA";
  hargaAktual?: { channelId: string; harga: number };
}

export function buildInputV2(c: CalcInput): KalkulasiInputV2 {
  const m = DEFAULT_MATERIAL[c.tipe];
  return {
    plates: [{
      durasiJam: c.durasiJam,
      mesinPerJam: DEFAULT_MESIN_PER_JAM,
      mesinPerJamJual: DEFAULT_MESIN_PER_JAM,
      materials: [{
        gramasi: c.gramasi,
        hppPerGram: m.hppPerGram,
        jualPerGram: m.jualPerGram,
        failureRatePct: m.failureRatePct,
      }],
    }],
    batch: 1,
    komponen: [],
    labor: [],
    ...(c.hargaAktual ? { hargaAktual: c.hargaAktual } : {}),
  };
}

export function compute(c: CalcInput): HasilKalkulasiV2 {
  return hitungKalkulasiV2(buildInputV2(c), defaultSettings);
}

export interface FullView {
  biayaModal: number;
  hargaJualMinimum: number;
  rekomendasi: number;
  channels: { channelId: string; nama: string; A: number; B: number; C: number; margin: number }[];
  status: HasilKalkulasiV2["status"];
}

export function fullView(c: CalcInput): FullView {
  const h = compute(c);
  const r = Math.round;
  const namaOf = (id: string) => defaultSettings.channels.find((ch) => ch.id === id)?.nama ?? id;
  const off = h.hargaPerChannel.find((ch) => ch.channelId === "offline")!;
  return {
    biayaModal: r(h.hppTotal),
    hargaJualMinimum: r(h.floorPrice),
    rekomendasi: r(off.B),
    channels: h.hargaPerChannel.map((ch) => ({
      channelId: ch.channelId,
      nama: namaOf(ch.channelId),
      A: r(ch.A),
      B: r(ch.B),
      C: r(ch.C),
      margin: r(ch.margin),
    })),
    status: h.status,
  };
}
