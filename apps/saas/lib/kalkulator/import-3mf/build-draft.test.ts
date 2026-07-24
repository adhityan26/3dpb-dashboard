import { describe, it, expect } from "vitest";
import { buildImportDraft, type BuildImportDraftInput } from "./build-draft";
import type { FilamentEntry } from "../local-settings";

const fil = (over: Partial<FilamentEntry> = {}): FilamentEntry => ({
  id: "fil-a", brand: "eSUN", material: "PLA+", tipe: "FDM", warna: "Putih", warnaHex: "#f5f5f5",
  hppPerGram: 300, jualPerGram: 900, ...over,
});

describe("buildImportDraft", () => {
  it("plate 2 filament: satu match katalog, satu tak match → fallback + warning", () => {
    const input: BuildImportDraftInput = {
      fileName: "Print.gcode.3mf",
      slicePlates: [{
        index: 1, weightG: 30, predictionSec: 3600, printerModelId: "C12", objectCount: 1,
        filaments: [
          { id: 1, type: "PLA", color: "#ffffff", usedG: 10 },
          { id: 2, type: "PETG", color: "#000000", usedG: 20 },
        ],
      }],
      modelPlates: [{ platerId: 1, platerName: "Bagian A", objectCount: 1 }],
      filamentSlots: [{ vendor: "eSUN", type: "PLA+" }, { vendor: "Unknown Brand", type: "PETG" }],
      filamentCatalog: [fil()],
    };
    const draft = buildImportDraft(input);
    expect(draft.nama).toBe("Print");
    expect(draft.isSliced).toBe(true);
    expect(draft.plates).toHaveLength(1);
    expect(draft.plates[0].nama).toBe("Bagian A");
    expect(draft.plates[0].durasiJam).toBe(1);
    expect(draft.plates[0].materials[0]).toMatchObject({ filamentId: "fil-a", tipe: "FDM", gramasi: 10, warnaHex: "#ffffff" });
    expect(draft.plates[0].materials[1]).toMatchObject({ filamentId: undefined, tipe: "FDM", gramasi: 20, warnaHex: "#000000" });
    expect(draft.warnings).toEqual([`Filament "Unknown Brand PETG" belum ada di katalog — pakai tarif default`]);
  });

  it("multi-plate → nama tiap plate dari model-settings, batch dari objectCount plate pertama", () => {
    const input: BuildImportDraftInput = {
      fileName: "Multi.3mf",
      slicePlates: [
        { index: 1, weightG: 10, predictionSec: 1800, printerModelId: null, objectCount: 2, filaments: [{ id: 1, type: "PLA", color: "#111111", usedG: 5 }] },
        { index: 2, weightG: 10, predictionSec: 1800, printerModelId: null, objectCount: 2, filaments: [{ id: 1, type: "PLA", color: "#111111", usedG: 5 }] },
      ],
      modelPlates: [
        { platerId: 1, platerName: "Bawah", objectCount: 2 },
        { platerId: 2, platerName: "Atas", objectCount: 2 },
      ],
      filamentSlots: [{ vendor: "eSUN", type: "PLA+" }],
      filamentCatalog: [fil()],
    };
    const draft = buildImportDraft(input);
    expect(draft.plates.map((p) => p.nama)).toEqual(["Bawah", "Atas"]);
    expect(draft.batch).toBe(2);
  });

  it("plate tanpa nama dari model-settings & tanpa filament → fallback 'Plate N' + material default", () => {
    const input: BuildImportDraftInput = {
      fileName: "NoName.3mf",
      slicePlates: [{ index: 1, weightG: 10, predictionSec: 1800, printerModelId: null, objectCount: 1, filaments: [] }],
      modelPlates: [],
      filamentSlots: [],
      filamentCatalog: [],
    };
    const draft = buildImportDraft(input);
    expect(draft.plates[0].nama).toBe("Plate 1");
    expect(draft.plates[0].materials).toEqual([{ tipe: "FDM", gramasi: 0 }]);
  });

  it("belum di-slice → isSliced false, gram/durasi 0, warning", () => {
    const input: BuildImportDraftInput = {
      fileName: "Unsliced.3mf",
      slicePlates: [],
      modelPlates: [{ platerId: 1, platerName: "Bagian A", objectCount: 3 }],
      filamentSlots: [],
      filamentCatalog: [],
    };
    const draft = buildImportDraft(input);
    expect(draft.isSliced).toBe(false);
    expect(draft.plates).toEqual([{ nama: "Bagian A", durasiJam: 0, materials: [{ tipe: "FDM", gramasi: 0 }] }]);
    expect(draft.batch).toBe(3);
    expect(draft.warnings).toEqual(["File belum di-slice — isi berat & durasi manual."]);
  });

  it("tipeFromMaterial: resin/UV → SLA (filament tak match katalog)", () => {
    const input: BuildImportDraftInput = {
      fileName: "Resin.3mf",
      slicePlates: [{ index: 1, weightG: 10, predictionSec: 3600, printerModelId: null, objectCount: 1, filaments: [{ id: 1, type: "Resin", color: "#ababab", usedG: 15 }] }],
      modelPlates: [],
      filamentSlots: [{ vendor: "Anycubic", type: "Resin" }],
      filamentCatalog: [],
    };
    const draft = buildImportDraft(input);
    expect(draft.plates[0].materials[0].tipe).toBe("SLA");
  });

  it("batch fallback 1 kalau objectCount plate pertama 0", () => {
    const input: BuildImportDraftInput = {
      fileName: "Zero.3mf",
      slicePlates: [{ index: 1, weightG: 10, predictionSec: 3600, printerModelId: null, objectCount: 0, filaments: [] }],
      modelPlates: [],
      filamentSlots: [],
      filamentCatalog: [],
    };
    const draft = buildImportDraft(input);
    expect(draft.batch).toBe(1);
  });
});
