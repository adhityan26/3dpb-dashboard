import {
  readGcode3mfEntries,
  parseSliceInfo,
  parseModelSettingsPlates,
  parseProjectSettingsFilamentSlots,
} from "@3pb/kalkulator-core/import-3mf";
import type { FilamentEntry } from "../local-settings";
import { buildImportDraft, type ImportDraft } from "./build-draft";

/** Parse file .3mf/.gcode.3mf jadi draft siap pakai untuk PlateInput.
 *  Semua parsing terjadi di browser — file tidak pernah di-upload ke server. */
export async function importSlicerFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null> {
  try {
    const buf = await file.arrayBuffer();
    const entries = await readGcode3mfEntries(buf);
    if (!entries) return null;

    const slicePlates = entries.sliceInfoXml ? parseSliceInfo(entries.sliceInfoXml) : [];
    const modelPlates = entries.modelSettingsXml ? parseModelSettingsPlates(entries.modelSettingsXml) : [];
    const filamentSlots = entries.projectSettingsJson ? parseProjectSettingsFilamentSlots(entries.projectSettingsJson) : [];

    return buildImportDraft({ fileName: file.name, slicePlates, modelPlates, filamentSlots, filamentCatalog: filaments });
  } catch {
    // Kontrak null-untuk-file-tak-valid harus berdiri sendiri, tak bergantung pada parser
    // di @3pb/kalkulator-core tak pernah throw — jaga-jaga kalau perilaku itu berubah nanti.
    return null;
  }
}
