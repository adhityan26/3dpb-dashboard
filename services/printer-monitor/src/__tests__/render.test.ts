import { describe, it, expect } from 'vitest'
import { renderTable } from '../render'

const T0 = Date.parse('2026-07-16T01:00:00Z')
const payload = { payload: [
  { name: 'Mars', type: 'P1P', state: 'running', progress: 42, remaining_min: 58, filename: 'nike.3mf', error_msg: '', last_seen: new Date(T0 - 30_000).toISOString() },
  { name: 'Jupiter', type: 'X1C', state: 'OFFLINE', progress: 100, remaining_min: 0, filename: 'old.3mf', error_msg: 'hms=...', last_seen: new Date(T0 - 3 * 3600_000).toISOString() },
] }

describe('renderTable', () => {
  it('menampilkan baris per printer: nama, state, progress-bar, sisa, umur last_seen', () => {
    const out = renderTable(payload, T0)
    expect(out).toContain('Mars'); expect(out).toContain('P1P')
    expect(out).toContain('running'); expect(out).toContain('42%')
    expect(out).toContain('58m'); expect(out).toContain('30s ago')
    expect(out).toContain('Jupiter'); expect(out).toContain('OFFLINE'); expect(out).toContain('3h ago')
  })
})
