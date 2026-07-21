// Warna persis dari firmware ~/Documents/Project/3pb-monitoring-display/apps/internal/src/display.h
// dan stateColor() di src/screens/printers.cpp — JANGAN diubah tanpa cross-check firmware.
export const CYD_COLORS = {
  bg: '#0a0a0f',
  green: '#00ff88',
  yellow: '#ffaa00',
  red: '#ff0000',
  orange: '#ffa726',
  purple: '#9c6bff',
  teal: '#4cc978',
  skyblue: '#4c9aff',
  pink: '#ff6b9c',
  dim: 'rgb(156,154,152)',
  finish: 'rgb(0,160,255)',
} as const

export function stateColor(state: string | null | undefined): string {
  const s = (state ?? '').toUpperCase()
  if (s === 'RUNNING' || s === 'PRINT') return CYD_COLORS.green
  if (s === 'ERROR') return CYD_COLORS.red
  if (s === 'FINISH') return CYD_COLORS.finish
  if (s === 'PAUSE' || s === 'PAUSED') return CYD_COLORS.yellow
  return CYD_COLORS.dim
}
