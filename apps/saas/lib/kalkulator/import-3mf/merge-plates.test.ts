import { describe, expect, it } from "vitest";
import { isPristinePlate, mergeImportedPlates } from "./merge-plates";

const empty = { nama: "", durasiJam: "", materials: [{ gramasi: "" }] };
const filled = { nama: "Body", durasiJam: "2.5", materials: [{ gramasi: "120" }] };

describe("isPristinePlate", () => {
  it("plate kosong bawaan dianggap pristine", () => {
    expect(isPristinePlate(empty)).toBe(true);
  });
  it("durasi terisi → bukan pristine", () => {
    expect(isPristinePlate({ ...empty, durasiJam: "1" })).toBe(false);
  });
  it("gramasi material terisi → bukan pristine", () => {
    expect(isPristinePlate({ ...empty, materials: [{ gramasi: "5" }] })).toBe(false);
  });
  it("nama terisi → bukan pristine", () => {
    expect(isPristinePlate({ ...empty, nama: "x" })).toBe(false);
  });
  it("durasi '0' dan gramasi '0' masih pristine (setara kosong)", () => {
    expect(isPristinePlate({ nama: " ", durasiJam: "0", materials: [{ gramasi: "0" }] })).toBe(true);
  });
});

describe("mergeImportedPlates", () => {
  it("state pristine: plate kosong diganti hasil import, wasPristine true", () => {
    const { plates, wasPristine } = mergeImportedPlates([empty], [filled]);
    expect(plates).toEqual([filled]);
    expect(wasPristine).toBe(true);
  });
  it("state terisi: hasil import di-append di belakang, wasPristine false", () => {
    const other = { ...filled, nama: "Lid" };
    const { plates, wasPristine } = mergeImportedPlates([filled], [other]);
    expect(plates).toEqual([filled, other]);
    expect(wasPristine).toBe(false);
  });
  it("plate pristine di tengah daftar terisi ikut dibuang saat append", () => {
    const other = { ...filled, nama: "Lid" };
    const { plates, wasPristine } = mergeImportedPlates([filled, empty], [other]);
    expect(plates).toEqual([filled, other]);
    expect(wasPristine).toBe(false);
  });
  it("existing kosong (0 plate) dianggap pristine", () => {
    const { plates, wasPristine } = mergeImportedPlates([], [filled]);
    expect(plates).toEqual([filled]);
    expect(wasPristine).toBe(true);
  });
});
