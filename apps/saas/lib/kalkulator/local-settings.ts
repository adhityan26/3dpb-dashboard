import type { SettingsV2 } from "@3pb/kalkulator-core";
import { defaultSettings, DEFAULT_MATERIAL, DEFAULT_MESIN_PER_JAM } from "./default-settings";

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
  return errs;
}
