import { RACK_SLOTS, GANYMEDE_SLOT } from './rack-template'
import type { LayoutConfigOut as LayoutConfigOutV2, LayoutCellOut as LayoutCellOutV2 } from './types'
import { LAYOUT_LIMITS } from './types'

interface LayoutCellOut {
  type?: 'label'
  text?: string
  printer?: string
  col: number
  row: number
  colSpan?: number
}
interface LayoutPageOut {
  id: string
  grid: { cols: number; rows: number; rowWeights?: number[] }
  fields: (string | { id: string; label?: string })[][]
  durationSec: number
  cells: LayoutCellOut[]
}
interface LayoutConfigOut {
  schemaVersion: 1
  pages: LayoutPageOut[]
}

const RACK_FIELDS = [['name'], ['state', 'progress'], ['progressBar']]
const DETAIL_FIELDS = [
  ['name', 'type'], ['state', 'progress'], ['progressBar'],
  [{ id: 'timeLeft', label: 'Sisa' }, { id: 'eta', label: 'ETA' }], ['filename'],
]

// Printer yang muncul lebih dari sekali di assignment (nilai non-kosong) — satu printer
// tidak boleh dipasang di lebih dari satu slot rak.
export function findDuplicatePrinterIds(assignment: Record<string, string>): string[] {
  const counts = new Map<string, number>()
  for (const value of Object.values(assignment)) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id)
}

export function buildLayoutConfig(assignment: Record<string, string>): LayoutConfigOut {
  const rackCells: LayoutCellOut[] = [
    { type: 'label', text: 'RAK KIRI', col: 0, row: 0, colSpan: 2 },
    { type: 'label', text: 'RAK KANAN', col: 3, row: 0, colSpan: 3 },
  ]
  const orderedPrinters: string[] = []

  for (const slot of RACK_SLOTS) {
    const printerId = assignment[slot.key]
    if (!printerId) continue
    rackCells.push({ printer: printerId, col: slot.col, row: slot.row })
    orderedPrinters.push(printerId)
  }
  const ganymedeId = assignment[GANYMEDE_SLOT.key]
  if (ganymedeId) {
    rackCells.push({ printer: ganymedeId, col: 0, row: 3, colSpan: 6 })
    orderedPrinters.push(ganymedeId)
  }

  const rackPage: LayoutPageOut = {
    id: 'rack',
    grid: { cols: 6, rows: 4, rowWeights: [0.06, 0.32, 0.36, 0.26] },
    fields: RACK_FIELDS,
    durationSec: 0,
    cells: rackCells,
  }

  const detailPages: LayoutPageOut[] = []
  for (let i = 0; i < orderedPrinters.length; i += 3) {
    const group = orderedPrinters.slice(i, i + 3)
    detailPages.push({
      id: `detail-${detailPages.length + 1}`,
      grid: { cols: 1, rows: group.length },
      fields: DETAIL_FIELDS,
      durationSec: 8,
      cells: group.map((printer, idx) => ({ printer, col: 0, row: idx })),
    })
  }

  return { schemaVersion: 1, pages: [rackPage, ...detailPages] }
}

// ==== v2: full-config validation (CYD Layout Editor v2, Task 5) ====
// Operates on the new LayoutConfigOut shape from ./types (produced interactively by the v2 canvas
// editor, Task 8-11), aliased *V2 here only to avoid colliding with the legacy local interfaces of
// the same name above (which stay untouched — buildLayoutConfig/findDuplicatePrinterIds are still
// consumed by the pre-v2 UI/API and are removed only once those callers are migrated).

type ValidationResult = { valid: true; config: LayoutConfigOutV2 } | { valid: false; error: string }

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
    const cell = cells[i] as LayoutCellOutV2
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

  return { valid: true, config: input as unknown as LayoutConfigOutV2 }
}
