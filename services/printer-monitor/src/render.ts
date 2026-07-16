import type { PrintersPayload } from '@3pb/printer-monitor-core'

const COLOR: Record<string, string> = {
  running: '\x1b[32m', pause: '\x1b[33m', finish: '\x1b[36m',
  error: '\x1b[31m', idle: '\x1b[2m', OFFLINE: '\x1b[31;2m',
}
const R = '\x1b[0m'

export function age(nowMs: number, iso: string | null): string {
  if (!iso) return '-'
  const s = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

const bar = (pct: number) => {
  const safe = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0
  const filled = Math.round(safe / 10)
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${pct}%`
}

export function renderTable(p: PrintersPayload, nowMs: number): string {
  const lines = [
    `  ${'PRINTER'.padEnd(10)} ${'TYPE'.padEnd(7)} ${'STATE'.padEnd(8)} ${'PROGRESS'.padEnd(17)} ${'SISA'.padEnd(6)} ${'SEEN'.padEnd(9)} FILE`,
  ]
  for (const r of p.payload) {
    const c = COLOR[r.state] ?? ''
    lines.push(
      `  ${r.name.padEnd(10)} ${r.type.padEnd(7)} ${c}${r.state.padEnd(8)}${R} ${bar(r.progress).padEnd(17)} ${(r.remaining_min + 'm').padEnd(6)} ${age(nowMs, r.last_seen).padEnd(9)} ${r.filename}`,
    )
  }
  return lines.join('\n')
}
