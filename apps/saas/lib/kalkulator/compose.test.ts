import { describe, it, expect } from "vitest";
import { composeKomponen, composeLabor, type KomponenRow, type LaborRow } from "./compose";

const krow = (o: Partial<KomponenRow>): KomponenRow => ({ id: "1", nama: "X", harga: 100, qty: 1, ...o });
const lrow = (o: Partial<LaborRow>): LaborRow => ({ id: "1", nama: "L", ...o });

describe("composeKomponen", () => {
  it("tanpa packing & rows → [] (parity)", () => expect(composeKomponen(undefined, [])).toEqual([]));
  it("packing terpilih → satu row pertama", () => {
    expect(composeKomponen({ nama: "Box 20x20", harga: 3000 }, [])).toEqual([{ nama: "Box 20x20", harga: 3000, qty: 1 }]);
  });
  it("packing harga 0 diabaikan", () => expect(composeKomponen({ nama: "Gratis", harga: 0 }, [])).toEqual([]));
  it("skip nama kosong / harga<=0, floor qty, trim, packing dulu", () => {
    const out = composeKomponen({ nama: "Box", harga: 3000 }, [
      krow({ nama: "  ", harga: 100 }), krow({ nama: "Baut", harga: 0 }), krow({ nama: " Mur ", harga: 300, qty: 0 }),
    ]);
    expect(out).toEqual([{ nama: "Box", harga: 3000, qty: 1 }, { nama: "Mur", harga: 300, qty: 1 }]);
  });
});
describe("composeLabor", () => {
  it("[] → [] (parity)", () => expect(composeLabor([])).toEqual([]));
  it("jam×rate lolos; biaya 0 & nama kosong skip", () => {
    expect(composeLabor([lrow({ nama: "Cat", jam: 2, ratePerJam: 75000 }), lrow({ nama: "Nol" }), lrow({ nama: " ", flat: 5000 })]))
      .toEqual([{ nama: "Cat", jam: 2, ratePerJam: 75000, flat: undefined }]);
  });
  it("flat-only lolos", () => expect(composeLabor([lrow({ nama: "C", flat: 55000 })])).toEqual([{ nama: "C", jam: undefined, ratePerJam: undefined, flat: 55000 }]));
});
