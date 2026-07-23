import {
  hitungKalkulasiV2,
  type KalkulasiInputV2,
  type HasilKalkulasiV2,
} from "@3pb/kalkulator-core";
import { defaultSettings } from "./default-settings";
import { DEFAULT_LOCAL_SETTINGS, toSettingsV2, type LocalSettings } from "./local-settings";
import { composeKomponen, composeLabor, type KomponenRow, type LaborRow } from "./compose";
import { ceil500 } from "./format";

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

// Sel strategi per channel×tier — turunan tampilan (harga dibulatkan ke atas kelipatan 500,
// laba & margin dihitung dari net setelah fee terhadap hppTotal). Formula core tidak berubah.
export interface StrategiCell { harga: number; laba: number; marginPct: number }
export type Strategi = Record<string, Record<"A" | "B" | "C", StrategiCell>>;

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
  strategi: Strategi;
}

export function fullView(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): FullView {
  const h = compute(c, ls);
  const settings = toSettingsV2(ls);
  const r = Math.round;
  const namaOf = (id: string) => settings.channels.find((ch) => ch.id === id)?.nama ?? id;
  const off = h.hargaPerChannel.find((ch) => ch.channelId === "offline")!;
  const packingHarga = c.packing?.harga ?? 0;
  // Strategi harga per channel×tier: harga dibulatkan ke atas kelipatan 500 (ceil500),
  // laba & margin dihitung dari net (harga dibagi fee channel) dikurangi hppTotal.
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const strategi: Strategi = {};
  for (const ch of h.hargaPerChannel) {
    const fee = settings.channels.find((s) => s.id === ch.channelId)?.feeMultiplier ?? 1;
    const cell = (tierVal: number) => {
      const harga = ceil500(tierVal);
      const net = fee > 0 ? harga / fee : 0;
      const laba = Math.round(net - h.hppTotal);
      return { harga, laba, marginPct: net > 0 ? round1((laba / net) * 100) : 0 };
    };
    strategi[ch.channelId] = { A: cell(ch.A), B: cell(ch.B), C: cell(ch.C) };
  }
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
    strategi,
  };
}
