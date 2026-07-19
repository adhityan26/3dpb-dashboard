import {
  hitungKalkulasiV2,
  type KalkulasiInputV2,
  type HasilKalkulasiV2,
} from "@3pb/kalkulator-core";
import { defaultSettings } from "./default-settings";
import { DEFAULT_LOCAL_SETTINGS, toSettingsV2, type LocalSettings } from "./local-settings";
import { composeKomponen, composeLabor, type KomponenRow, type LaborRow } from "./compose";

export { defaultSettings };

export interface CalcInput {
  gramasi: number;
  durasiJam: number;
  tipe: "FDM" | "SLA";
  hargaAktual?: { channelId: string; harga: number };
  komponen?: KomponenRow[];
  labor?: LaborRow[];
  packing?: { nama: string; harga: number };
}

export function buildInputV2(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): KalkulasiInputV2 {
  const m = ls.material[c.tipe];
  return {
    plates: [{
      durasiJam: c.durasiJam,
      mesinPerJam: ls.mesinPerJam,
      mesinPerJamJual: ls.mesinPerJam,
      materials: [{
        gramasi: c.gramasi,
        hppPerGram: m.hppPerGram,
        jualPerGram: m.jualPerGram,
        failureRatePct: m.failureRatePct,
      }],
    }],
    batch: 1,
    komponen: composeKomponen(c.packing, c.komponen ?? []),
    labor: composeLabor(c.labor ?? []),
    ...(c.hargaAktual ? { hargaAktual: c.hargaAktual } : {}),
  };
}

export function compute(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): HasilKalkulasiV2 {
  return hitungKalkulasiV2(buildInputV2(c, ls), toSettingsV2(ls));
}

export interface FullView {
  biayaModal: number;
  hargaJualMinimum: number;
  rekomendasi: number;
  channels: { channelId: string; nama: string; A: number; B: number; C: number; margin: number }[];
  status: HasilKalkulasiV2["status"];
  rincian: {
    produksi: number; komponen: number; packing: number; labor: number;
    biayaModal: number; hargaJualMinimum: number; rekomendasi: number;
  };
}

export function fullView(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): FullView {
  const h = compute(c, ls);
  const settings = toSettingsV2(ls);
  const r = Math.round;
  const namaOf = (id: string) => settings.channels.find((ch) => ch.id === id)?.nama ?? id;
  const off = h.hargaPerChannel.find((ch) => ch.channelId === "offline")!;
  const packingHarga = c.packing?.harga ?? 0;
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
    rincian: {
      produksi: r(h.hppProduksi),
      komponen: r(h.hppKomponen - packingHarga),
      packing: r(packingHarga),
      labor: r(h.hppLabor),
      biayaModal: r(h.hppTotal),
      hargaJualMinimum: r(h.floorPrice),
      rekomendasi: r(off.B),
    },
  };
}
