import type { SliceInfoPlate, ModelSettingsPlate, ProjectFilamentSlot } from "@3pb/kalkulator-core/import-3mf";
import type { FilamentEntry } from "../local-settings";

export interface ImportedMaterial {
  filamentId?: string;
  tipe: "FDM" | "SLA";
  gramasi: number;
  warnaHex?: string;
}

export interface ImportedPlate {
  nama: string;
  durasiJam: number;
  materials: ImportedMaterial[];
}

export interface ImportDraft {
  nama: string;
  plates: ImportedPlate[];
  batch: number;
  isSliced: boolean;
  warnings: string[];
}

export interface BuildImportDraftInput {
  fileName: string;
  slicePlates: SliceInfoPlate[];
  modelPlates: ModelSettingsPlate[];
  filamentSlots: ProjectFilamentSlot[];
  filamentCatalog: FilamentEntry[];
}

const UNSLICED_WARNING = "File belum di-slice — isi berat & durasi manual.";
const FALLBACK_MATERIAL: ImportedMaterial = { tipe: "FDM", gramasi: 0 };

function deriveNama(fileName: string): string {
  return fileName.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "");
}

function tipeFromMaterial(material: string): "FDM" | "SLA" {
  return /resin|uv/i.test(material) ? "SLA" : "FDM";
}

function findFilamentMatch(brand: string, material: string, catalog: FilamentEntry[]): FilamentEntry | undefined {
  return catalog.find(
    (f) => f.brand.toLowerCase() === brand.toLowerCase() && f.material.toLowerCase() === material.toLowerCase(),
  );
}

function buildMaterial(
  filament: { id: number; type: string; color: string; usedG: number },
  filamentSlots: ProjectFilamentSlot[],
  catalog: FilamentEntry[],
  warnings: string[],
): ImportedMaterial {
  const slot = filamentSlots[filament.id - 1];
  const brand = slot?.vendor ?? "";
  const material = slot?.type || filament.type;
  const match = findFilamentMatch(brand, material, catalog);
  if (!match) {
    warnings.push(`Filament "${brand} ${material}" belum ada di katalog — pakai tarif default`);
  }
  return {
    filamentId: match?.id,
    tipe: match?.tipe ?? tipeFromMaterial(material),
    gramasi: filament.usedG,
    warnaHex: filament.color,
  };
}

function namaPlate(modelPlate: ModelSettingsPlate | undefined, index: number): string {
  return modelPlate?.platerName?.trim() || `Plate ${index + 1}`;
}

function buildSlicedPlate(
  slicePlate: SliceInfoPlate,
  modelPlate: ModelSettingsPlate | undefined,
  index: number,
  filamentSlots: ProjectFilamentSlot[],
  catalog: FilamentEntry[],
  warnings: string[],
): ImportedPlate {
  const durasiJam = Math.round((slicePlate.predictionSec / 3600) * 100) / 100;
  const materials = slicePlate.filaments.map((f) => buildMaterial(f, filamentSlots, catalog, warnings));
  return {
    nama: namaPlate(modelPlate, index),
    durasiJam,
    materials: materials.length > 0 ? materials : [{ ...FALLBACK_MATERIAL }],
  };
}

function buildUnslicedPlate(modelPlate: ModelSettingsPlate | undefined, index: number): ImportedPlate {
  return { nama: namaPlate(modelPlate, index), durasiJam: 0, materials: [{ ...FALLBACK_MATERIAL }] };
}

export function buildImportDraft(input: BuildImportDraftInput): ImportDraft {
  const { fileName, slicePlates, modelPlates, filamentSlots, filamentCatalog } = input;
  const isSliced = slicePlates.length > 0;
  const warnings: string[] = [];

  const plates: ImportedPlate[] = isSliced
    ? slicePlates.map((sp, i) => buildSlicedPlate(sp, modelPlates[i], i, filamentSlots, filamentCatalog, warnings))
    : modelPlates.length > 0
      ? modelPlates.map((mp, i) => buildUnslicedPlate(mp, i))
      : [buildUnslicedPlate(undefined, 0)];

  if (!isSliced) warnings.push(UNSLICED_WARNING);

  const firstCount = (isSliced ? slicePlates[0] : modelPlates[0])?.objectCount;
  const batch = firstCount && firstCount > 0 ? firstCount : 1;

  return { nama: deriveNama(fileName), plates, batch, isSliced, warnings };
}
