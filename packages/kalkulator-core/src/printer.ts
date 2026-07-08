import type { PrinterCostInput } from './types'

/** Estimasi biaya mesin per jam: listrik + depresiasi + maintenance. */
export function hitungMesinPerJam(i: PrinterCostInput): number {
  return (i.watt / 1000) * i.tarifPerKwh + i.hargaPrinter / i.umurPakaiJam + (i.maintenancePerJam ?? 0)
}
