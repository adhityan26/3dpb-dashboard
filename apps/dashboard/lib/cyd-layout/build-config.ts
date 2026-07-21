import type { LayoutConfigOut, LayoutCellOut } from './types'
import { LAYOUT_LIMITS } from './types'

// Full-config validation (CYD Layout Editor v2). Operates on the LayoutConfigOut shape from
// ./types, produced interactively by the v2 canvas editor (Tasks 8-11).

type ValidationResult = { valid: true; config: LayoutConfigOut } | { valid: false; error: string }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validatePage(page: unknown, index: number): string | null {
  if (!isPlainObject(page)) return `pages[${index}] bukan object`
  if (typeof page.id !== 'string' || !page.id) return `pages[${index}].id wajib string non-kosong`

  const grid = page.grid
  if (!isPlainObject(grid)) return `pages[${index}].grid wajib object`
  if (typeof grid.cols !== 'number' || grid.cols < 1) return `pages[${index}].grid.cols wajib >= 1`
  if (typeof grid.rows !== 'number' || grid.rows < 1) return `pages[${index}].grid.rows wajib >= 1`

  if (grid.rowWeights !== undefined) {
    if (!Array.isArray(grid.rowWeights) || grid.rowWeights.length !== grid.rows) {
      return `pages[${index}].grid.rowWeights panjangnya harus sama dengan grid.rows`
    }
    const sum = (grid.rowWeights as number[]).reduce((a, b) => a + b, 0)
    if (sum <= 0) return `pages[${index}].grid.rowWeights sum harus > 0`
  }

  if (typeof page.durationSec !== 'number' || page.durationSec < 0) {
    return `pages[${index}].durationSec wajib angka >= 0`
  }

  const cells = page.cells
  if (!Array.isArray(cells)) return `pages[${index}].cells wajib array`
  if (cells.length > LAYOUT_LIMITS.maxCellsPerPage) {
    return `pages[${index}].cells melebihi batas ${LAYOUT_LIMITS.maxCellsPerPage}`
  }

  const seenPrinters = new Set<string>()
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i] as LayoutCellOut
    if (!isPlainObject(cell)) return `pages[${index}].cells[${i}] bukan object`

    if (typeof cell.col !== 'number' || typeof cell.row !== 'number') {
      return `pages[${index}].cells[${i}] wajib punya col/row angka`
    }
    const colSpan = cell.colSpan ?? 1
    const rowSpan = cell.rowSpan ?? 1
    if (cell.col + colSpan > (grid.cols as number)) return `pages[${index}].cells[${i}] col+colSpan melebihi grid.cols`
    if (cell.row + rowSpan > (grid.rows as number)) return `pages[${index}].cells[${i}] row+rowSpan melebihi grid.rows`

    if ('type' in cell && cell.type === 'label') {
      if (typeof cell.text !== 'string') return `pages[${index}].cells[${i}] label wajib punya text string`
    } else {
      const printerCell = cell as { printer?: unknown }
      if (typeof printerCell.printer !== 'string' || !printerCell.printer) {
        return `pages[${index}].cells[${i}] wajib punya printer (string non-kosong) kecuali type:'label'`
      }
      if (seenPrinters.has(printerCell.printer)) {
        return `pages[${index}] printer "${printerCell.printer}" dipasang lebih dari sekali di halaman yang sama`
      }
      seenPrinters.add(printerCell.printer)
    }
  }

  return null
}

export function validateLayoutConfig(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return { valid: false, error: 'config wajib berupa object' }
  if (input.schemaVersion !== 1) return { valid: false, error: 'schemaVersion wajib 1' }

  const pages = input.pages
  if (!Array.isArray(pages) || pages.length === 0) return { valid: false, error: 'pages wajib array non-kosong' }
  if (pages.length > LAYOUT_LIMITS.maxPages) return { valid: false, error: `pages melebihi batas ${LAYOUT_LIMITS.maxPages}` }

  for (let i = 0; i < pages.length; i++) {
    const err = validatePage(pages[i], i)
    if (err) return { valid: false, error: err }
  }

  return { valid: true, config: input as unknown as LayoutConfigOut }
}
