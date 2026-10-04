import {
  readGcode3mfEntries,
  parseSliceInfo,
  parseModelSettingsPlates,
  parseProjectSettingsFilamentSlots,
} from "@3pb/kalkulator-core/import-3mf";
import type { FilamentEntry } from "../local-settings";
import { buildImportDraft, type ImportDraft } from "./build-draft";
import { importGcodeFile, isRawGcode } from "./gcode";

/** Parse file .3mf/.gcode.3mf/.gcode jadi draft siap pakai untuk PlateInput.
 *  Semua parsing terjadi di browser — file tidak pernah di-upload ke server. */
export async function importSlicerFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null> {
  try {
    if (isRawGcode(file.name)) {
      const draft = await importGcodeFile(file, filaments);
      if (draft) return draft;
      // Some exports are a zipped plate saved as "*.gcode" (PK header) — let the zip path try.
      // Peek at 2 bytes only: don't load a 100-200 MB plain gcode into memory just to learn it is not a zip.
      const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      if (magic[0] !== 0x50 || magic[1] !== 0x4b) return null;
    }

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
