export interface RackSlot {
  key: string        // "mars", "saturn", ... — matches cell col/row purpose, not a printer id
  label: string       // shown above the dropdown, mis. "Rak Kiri — Atas 1"
  col: number
  row: number
}

export const RACK_SLOTS: RackSlot[] = [
  { key: 'topLeft1',    label: 'Rak Kiri — Atas 1',    col: 0, row: 1 },
  { key: 'topLeft2',    label: 'Rak Kiri — Atas 2',    col: 1, row: 1 },
  { key: 'topRight1',   label: 'Rak Kanan — Atas 1',   col: 3, row: 1 },
  { key: 'topRight2',   label: 'Rak Kanan — Atas 2',   col: 4, row: 1 },
  { key: 'topRight3',   label: 'Rak Kanan — Atas 3',   col: 5, row: 1 },
  { key: 'botLeft1',    label: 'Rak Kiri — Bawah 1',   col: 0, row: 2 },
  { key: 'botLeft2',    label: 'Rak Kiri — Bawah 2',   col: 1, row: 2 },
  { key: 'botRight2',   label: 'Rak Kanan — Bawah 2',  col: 4, row: 2 },
  { key: 'botRight3',   label: 'Rak Kanan — Bawah 3',  col: 5, row: 2 },
]

export const GANYMEDE_SLOT: RackSlot = { key: 'ganymede', label: 'Strip bawah (lebar penuh)', col: 0, row: 3 }
