import type { SettingsV2 } from "@3pb/kalkulator-core";
import { isValidHexColor } from "@3pb/ui";
import { defaultSettings, DEFAULT_MATERIAL, DEFAULT_MESIN_PER_JAM } from "./default-settings";

export interface KomponenPreset { id: string; nama: string; harga: number }
export type PackingPreset = KomponenPreset;
export interface LaborItemInput { nama: string; jam?: number; ratePerJam?: number; flat?: number }
export interface LaborPreset { id: string; nama: string; items: LaborItemInput[] }
export interface LaborJob { id: string; nama: string; ratePerJam?: number; flat?: number }

export interface FilamentEntry {
  id: string;
  brand: string;
  material: string;         // polimer: "PLA+", "PETG", "Resin"
  tipe: "FDM" | "SLA";
  warna: string;
  warnaHex?: string;
  hppPerGram: number;
  jualPerGram: number;
  failureRatePct?: number;
}

export interface LocalSettings {
  material: {
    FDM: { hppPerGram: number; jualPerGram: number; failureRatePct: number };
    SLA: { hppPerGram: number; jualPerGram: number; failureRatePct: number };
  };
  mesinPerJam: number;
  failureSpreadPct: number;
  testLayerPct: number;
  margin: { A: number; B: number; C: number };
  resellerBulkMultiplier: number;
  channels: { offline: number; shopee: number };
  komponenPresets: KomponenPreset[];
  packingPresets: PackingPreset[];
  laborPresets: LaborPreset[];
  laborJobs: LaborJob[];
  filaments: FilamentEntry[];
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  material: { FDM: { ...DEFAULT_MATERIAL.FDM }, SLA: { ...DEFAULT_MATERIAL.SLA } },
  mesinPerJam: DEFAULT_MESIN_PER_JAM,
  failureSpreadPct: defaultSettings.failureSpreadPct,
  testLayerPct: defaultSettings.testLayerPct,
  margin: { ...defaultSettings.marginMultipliers },
  resellerBulkMultiplier: defaultSettings.resellerBulkMultiplier,
  channels: {
    offline: defaultSettings.channels.find((c) => c.id === "offline")!.feeMultiplier,
    shopee: defaultSettings.channels.find((c) => c.id === "shopee")!.feeMultiplier,
  },
  komponenPresets: [
    { id: "kmp-gantungan-kewkew", nama: "Gantungan kew-kew", harga: 900 },
    { id: "kmp-gantungan-ring", nama: "Gantungan ring", harga: 800 },
    { id: "kmp-gantungan-rantai", nama: "Gantungan rantai", harga: 350 },
    { id: "kmp-gantungan-tali", nama: "Gantungan tali", harga: 400 },
    { id: "kmp-switch", nama: "Switch", harga: 2500 },
    { id: "kmp-label", nama: "Label", harga: 750 },
  ],
  packingPresets: [
    { id: "pack-s", nama: "Packing S", harga: 1500 },
    { id: "pack-m", nama: "Packing M", harga: 2500 },
    { id: "pack-l", nama: "Packing L", harga: 5000 },
    { id: "pack-xl", nama: "Packing XL", harga: 8000 },
  ],
  laborPresets: [
    { id: "lbr-mask-minimal", nama: "Finishing Ringan", items: [
      { nama: "Assembly", jam: 0.25, ratePerJam: 35000 },
      { nama: "Sanding", jam: 0.5, ratePerJam: 35000 },
      { nama: "Painting", jam: 0.5, ratePerJam: 75000 },
    ] },
    { id: "lbr-mask-medium", nama: "Finishing Standar", items: [
      { nama: "Assembly", jam: 0.5, ratePerJam: 35000 },
      { nama: "Sanding", jam: 1, ratePerJam: 35000 },
      { nama: "Painting", jam: 2, ratePerJam: 75000 },
    ] },
    { id: "lbr-mask-heavy", nama: "Finishing Lengkap", items: [
      { nama: "Assembly", jam: 1, ratePerJam: 35000 },
      { nama: "Sanding", jam: 4, ratePerJam: 35000 },
      { nama: "Painting", jam: 3.5, ratePerJam: 75000 },
    ] },
  ],
  laborJobs: [
    { id: "job-assembly", nama: "Assembly", ratePerJam: 35000 },
    { id: "job-sanding", nama: "Sanding", ratePerJam: 35000 },
    { id: "job-painting", nama: "Painting", ratePerJam: 75000 },
  ],
  filaments: [
    { id: "fil-pla-putih",  brand: "eSUN",     material: "PLA+",  tipe: "FDM", warna: "Putih", warnaHex: "#f5f5f5", hppPerGram: 300,  jualPerGram: 900 },
    { id: "fil-petg-hitam", brand: "eSUN",     material: "PETG",  tipe: "FDM", warna: "Hitam", warnaHex: "#1a1a1a", hppPerGram: 300,  jualPerGram: 900 },
    { id: "fil-resin-abu",  brand: "Anycubic", material: "Resin", tipe: "SLA", warna: "Abu",   warnaHex: "#9ca3af", hppPerGram: 1750, jualPerGram: 3500 },
  ],
};

export function toSettingsV2(ls: LocalSettings): SettingsV2 {
  return {
    failureSpreadPct: ls.failureSpreadPct,
    testLayerPct: ls.testLayerPct,
    marginMultipliers: { ...ls.margin },
    resellerBulkMultiplier: ls.resellerBulkMultiplier,
    channels: [
      { id: "offline", nama: "Offline", feeMultiplier: ls.channels.offline },
      { id: "shopee", nama: "Shopee", feeMultiplier: ls.channels.shopee },
    ],
  };
}

export function newFilamentEntry(): FilamentEntry {
  return { id: "", brand: "", material: "", tipe: "FDM", warna: "", hppPerGram: 0, jualPerGram: 0 };
}

export function validateLocalSettings(ls: LocalSettings): string[] {
  const errs: string[] = [];
  const pos = (n: number, name: string) => { if (!(n > 0)) errs.push(`${name} harus > 0`); };
  const pct = (n: number, name: string) => { if (n < 0 || n > 100) errs.push(`${name} harus 0–100`); };
  for (const t of ["FDM", "SLA"] as const) {
    pos(ls.material[t].hppPerGram, `${t} harga modal`);
    pos(ls.material[t].jualPerGram, `${t} harga jual`);
    pct(ls.material[t].failureRatePct, `${t} failure rate`);
  }
  pos(ls.mesinPerJam, "Biaya mesin/jam");
  pct(ls.failureSpreadPct, "Failure spread");
  pct(ls.testLayerPct, "Test layer");
  pos(ls.margin.A, "Margin Kompetitif");
  pos(ls.margin.B, "Margin Standard");
  pos(ls.margin.C, "Margin Premium");
  pos(ls.resellerBulkMultiplier, "Reseller bulk");
  if (ls.channels.offline < 1) errs.push("Fee offline ≥ 1");
  if (ls.channels.shopee < 1) errs.push("Fee shopee ≥ 1");
  const checkPresetList = (list: KomponenPreset[], label: string) =>
    list.forEach((k, i) => {
      if (!k.nama.trim()) errs.push(`${label} #${i + 1} nama kosong`);
      if (!(k.harga > 0)) errs.push(`${label} "${k.nama || i + 1}" harga harus > 0`);
    });
  checkPresetList(ls.komponenPresets, "Komponen");
  checkPresetList(ls.packingPresets, "Packing");
  ls.laborPresets.forEach((p, i) => {
    if (!p.nama.trim()) errs.push(`Labor #${i + 1} nama kosong`);
    if (p.items.length === 0) errs.push(`Labor "${p.nama || i + 1}" harus punya item`);
    p.items.forEach((it, j) => {
      if (!it.nama.trim()) errs.push(`Labor "${p.nama}" item #${j + 1} nama kosong`);
      for (const [f, v] of [["jam", it.jam], ["rate", it.ratePerJam], ["flat", it.flat]] as const) {
        if (v != null && v < 0) errs.push(`Labor "${p.nama}" ${f} negatif`);
      }
      const biaya = (it.jam ?? 0) * (it.ratePerJam ?? 0) + (it.flat ?? 0);
      if (!(biaya > 0)) errs.push(`Labor "${p.nama}" item "${it.nama || j + 1}" biaya harus > 0`);
    });
  });
  ls.laborJobs.forEach((j, i) => {
    if (!j.nama.trim()) errs.push(`Pekerjaan #${i + 1} nama kosong`);
    if (j.ratePerJam != null && j.ratePerJam < 0) errs.push(`Pekerjaan "${j.nama || i + 1}" tarif negatif`);
    if (j.flat != null && j.flat < 0) errs.push(`Pekerjaan "${j.nama || i + 1}" tarif negatif`);
  });
  const jobNames = ls.laborJobs.map((j) => j.nama.trim().toLowerCase()).filter(Boolean);
  if (new Set(jobNames).size !== jobNames.length) errs.push("Ada nama pekerjaan yang sama — nama harus unik");
  ls.filaments.forEach((f, i) => {
    const label = `${f.brand} ${f.material} ${f.warna}`.trim() || `#${i + 1}`;
    if (!`${f.brand}${f.material}${f.warna}`.trim()) errs.push(`Filament #${i + 1} brand/material/warna kosong`);
    if (!(f.hppPerGram > 0)) errs.push(`Filament "${label}" harga modal harus > 0`);
    if (!(f.jualPerGram > 0)) errs.push(`Filament "${label}" harga jual harus > 0`);
    if (f.warnaHex != null && f.warnaHex.trim() !== "" && !isValidHexColor(f.warnaHex)) errs.push(`Filament "${label}" warna hex tidak valid`);
    if (f.failureRatePct != null && (f.failureRatePct < 0 || f.failureRatePct > 100)) errs.push(`Filament "${label}" failure rate harus 0–100`);
  });
  const filKeys = ls.filaments.map((f) => `${f.brand}|${f.material}|${f.warna}`.trim().toLowerCase()).filter((k) => k !== "||");
  if (new Set(filKeys).size !== filKeys.length) errs.push("Ada filament dengan identitas sama — brand+material+warna harus unik");
  return errs;
}
