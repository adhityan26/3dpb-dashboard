import { describe, it, expect } from "vitest";
import { hitungKalkulasiV2 } from "@3pb/kalkulator-core";
import { defaultSettings, buildTeaserInputV2, teaserView } from "./teaser";

const INPUT = { gramasi: 100, durasiJam: 2, tipe: "FDM" as const };

describe("teaser parity", () => {
  it("teaserView == hitungKalkulasiV2 (teaser hanya memformat, tak hitung ulang)", () => {
    const h = hitungKalkulasiV2(buildTeaserInputV2(INPUT), defaultSettings);
    const off = h.hargaPerChannel.find(c => c.channelId === "offline")!;
    const shop = h.hargaPerChannel.find(c => c.channelId === "shopee")!;
    const v = teaserView(INPUT);
    expect(v.biayaModal).toBe(Math.round(h.hppTotal));
    expect(v.hargaJualMinimum).toBe(Math.round(h.floorPrice));
    expect(v.rekomendasi).toBe(Math.round(off.B));
    expect(v.offlineABC).toEqual([Math.round(off.A), Math.round(off.B), Math.round(off.C)]);
    expect(v.shopeeABC).toEqual([Math.round(shop.A), Math.round(shop.B), Math.round(shop.C)]);
  });
  it("nilai wajar (biaya modal > 0, harga minimum > biaya modal)", () => {
    const v = teaserView(INPUT);
    expect(v.biayaModal).toBeGreaterThan(0);
    expect(v.hargaJualMinimum).toBeGreaterThan(v.biayaModal);
    expect(v.offlineABC[2]).toBeGreaterThan(v.offlineABC[0]); // C > A
  });
});
