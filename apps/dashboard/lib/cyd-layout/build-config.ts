import { RACK_SLOTS, GANYMEDE_SLOT } from './rack-template'

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
