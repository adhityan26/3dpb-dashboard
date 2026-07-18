import type { SettingsV2 } from "@3pb/kalkulator-core";

export const defaultSettings: SettingsV2 = {
  failureSpreadPct: 50,
  testLayerPct: 5,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 },
  resellerBulkMultiplier: 1.05,
  channels: [
    { id: "offline", nama: "Offline", feeMultiplier: 1 },
    { id: "shopee", nama: "Shopee", feeMultiplier: 1.2 },
  ],
};

export const DEFAULT_MATERIAL = {
  FDM: { hppPerGram: 300, jualPerGram: 900, failureRatePct: 12 },
  SLA: { hppPerGram: 1750, jualPerGram: 3500, failureRatePct: 12 },
} as const;

export const DEFAULT_MESIN_PER_JAM = 4000; // Bambu P1P — sekaligus mesin acuan harga
