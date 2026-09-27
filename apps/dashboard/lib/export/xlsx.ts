import * as XLSX from "xlsx"

/**
 * Builds a single-sheet workbook from plain row objects — each object's own
 * keys become the header row, in insertion order (same as
 * `XLSX.utils.json_to_sheet`'s own behavior). Kept separate from
 * `downloadRowsAsXlsx` so the row-shaping (what each caller puts in each
 * object) stays unit-testable without touching the browser download API.
 */
export function buildXlsxWorkbook(sheetName: string, rows: Record<string, unknown>[]): XLSX.WorkBook {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, sheetName)
  return wb
}

/** Builds the workbook and triggers a browser download of it as `filename` (client-side only). */
export function downloadRowsAsXlsx(filename: string, sheetName: string, rows: Record<string, unknown>[]): void {
  const wb = buildXlsxWorkbook(sheetName, rows)
  XLSX.writeFile(wb, filename)
}
