import { describe, it, expect } from "vitest";
import { defaultSettings } from "@/lib/kalkulator/default-settings";
import { DEFAULT_LOCAL_SETTINGS, toSettingsV2, validateLocalSettings } from "@/lib/kalkulator/local-settings";

describe("toSettingsV2 parity", () => {
  it("DEFAULT_LOCAL_SETTINGS → deep-equal defaultSettings existing", () => {
    expect(toSettingsV2(DEFAULT_LOCAL_SETTINGS)).toEqual(defaultSettings);
  });
  it("reflect margin.A + channel.shopee + failureSpread", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, margin: { A: 1.3, B: 1.5, C: 2 }, channels: { offline: 1, shopee: 1.5 }, failureSpreadPct: 70 };
    const s = toSettingsV2(ls);
    expect(s.marginMultipliers.A).toBe(1.3);
    expect(s.channels.find((c) => c.id === "shopee")!.feeMultiplier).toBe(1.5);
    expect(s.failureSpreadPct).toBe(70);
  });
});

describe("validateLocalSettings", () => {
  it("default valid → []", () => { expect(validateLocalSettings(DEFAULT_LOCAL_SETTINGS)).toEqual([]); });
  it("hpp ≤ 0 → error", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, material: { ...DEFAULT_LOCAL_SETTINGS.material, FDM: { ...DEFAULT_LOCAL_SETTINGS.material.FDM, hppPerGram: 0 } } };
    expect(validateLocalSettings(ls).length).toBeGreaterThan(0);
  });
  it("failure > 100 → error", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, material: { ...DEFAULT_LOCAL_SETTINGS.material, SLA: { ...DEFAULT_LOCAL_SETTINGS.material.SLA, failureRatePct: 150 } } };
    expect(validateLocalSettings(ls).length).toBeGreaterThan(0);
  });
  it("fee < 1 → error", () => {
    expect(validateLocalSettings({ ...DEFAULT_LOCAL_SETTINGS, channels: { offline: 0.5, shopee: 1.2 } }).length).toBeGreaterThan(0);
  });
  it("reseller ≤ 0 → error", () => {
    expect(validateLocalSettings({ ...DEFAULT_LOCAL_SETTINGS, resellerBulkMultiplier: 0 }).length).toBeGreaterThan(0);
  });
});
