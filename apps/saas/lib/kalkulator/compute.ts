import {
  hitungKalkulasiV2,
  type KalkulasiInputV2,
  type HasilKalkulasiV2,
} from "@3pb/kalkulator-core";
import { defaultSettings } from "./default-settings";
import { DEFAULT_LOCAL_SETTINGS, toSettingsV2, type LocalSettings } from "./local-settings";
import { composeKomponen, composeLabor, type KomponenRow, type LaborRow } from "./compose";

export { defaultSettings };

export interface CalcPlate {
  id: string;
  nama?: string;
  tipe: "FDM" | "SLA";
  gramasi: number;
  durasiJam: number;
}

export interface CalcInput {
  // legacy single-plate — tetap didukung agar seluruh test lama hijau
  gramasi?: number;
  durasiJam?: number;
  tipe?: "FDM" | "SLA";
  // multi-plate (1b-3) — kalau plates ada & non-kosong, dipakai; kalau tidak, fallback ke 3 field legacy
  plates?: CalcPlate[];
  batch?: number;
  hargaAktual?: { channelId: string; harga: number };
  komponen?: KomponenRow[];
  labor?: LaborRow[];
  packing?: { nama: string; harga: number };
}

export function buildInputV2(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): KalkulasiInputV2 {
  const toPlate = (tipe: "FDM" | "SLA", gramasi: number, durasiJam: number, nama?: string) => {
    const m = ls.material[tipe];
    return {
      ...(nama ? { namaPart: nama } : {}),
      durasiJam,
      mesinPerJam: ls.mesinPerJam,
      mesinPerJamJual: ls.mesinPerJam,
      materials: [{
        gramasi,
        hppPerGram: m.hppPerGram,
        jualPerGram: m.jualPerGram,
        failureRatePct: m.failureRatePct,
      }],
    };
  };
  const plates =
    c.plates && c.plates.length > 0
      ? c.plates.map((p) => toPlate(p.tipe, p.gramasi, p.durasiJam, p.nama))
      : [toPlate(c.tipe ?? "FDM", c.gramasi ?? 0, c.durasiJam ?? 0)];
  const safeBatch =
    typeof c.batch === "number" && Number.isFinite(c.batch) && c.batch >= 1 ? c.batch : 1;
  return {
    plates,
    batch: safeBatch,
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
