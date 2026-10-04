import { gcodeSummaryToSliceInput, parseGcodeSummary } from "@3pb/kalkulator-core/import-gcode";
import type { FilamentEntry } from "../local-settings";
import { buildImportDraft, type ImportDraft } from "./build-draft";

/** Bambu keeps summary + config near the start, Orca near the end — both fit well
 *  inside 128 KB (verified: Bambu config ~34 KB in, Orca footer ~27 KB from the end
 *  of a 97.7 MB file), so huge gcode never has to be read whole. */
export const GCODE_EDGE_BYTES = 128 * 1024;

/** True for raw `.gcode`; `.gcode.3mf` stays on the zip path. */
export function isRawGcode(fileName: string): boolean {
  return /\.gcode$/i.test(fileName);
}

export async function readGcodeEdges(file: File, edgeBytes = GCODE_EDGE_BYTES): Promise<{ head: string; tail: string }> {
  const head = await file.slice(0, edgeBytes).text();
  const tail = await file.slice(Math.max(0, file.size - edgeBytes)).text();
  return { head, tail };
}

/** Raw .gcode → ImportDraft via the same builder the 3MF import uses. Null when the slicer is unsupported. */
export async function importGcodeFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null> {
  const { head, tail } = await readGcodeEdges(file);
  const summary = parseGcodeSummary(head, tail);
  if (!summary) return null;
  const { slicePlate, filamentSlots } = gcodeSummaryToSliceInput(summary);
  return buildImportDraft({
    fileName: file.name,
    slicePlates: [slicePlate],
    modelPlates: [],
    filamentSlots,
    filamentCatalog: filaments,
  });
}
