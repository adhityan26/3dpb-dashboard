import { describe, it, expect } from 'vitest'
import { StateStore } from '../state-store'
import { buildPrintersPayload } from '../payload'
import { normalizeBambu } from '../normalize-bambu'
import type { DeviceConfig } from '../types'

const mars: DeviceConfig = { id: 'mars', name: 'Mars', type: 'P1P', connector: 'bambu', ip: '10.0.0.9', serial: '01S00A2C0502433', accessCode: 'x' }
const gany: DeviceConfig = { id: 'ganymede', name: 'Ganymede', type: 'U1', connector: 'moonraker', ip: '192.168.88.40' }

const T0 = Date.parse('2026-07-16T00:50:00.000Z')

describe('StateStore + buildPrintersPayload', () => {
  it('device tanpa data → OFFLINE, field default', () => {
    const p = buildPrintersPayload([mars], new StateStore(), T0)
    expect(p.payload).toEqual([{
      name: 'Mars', type: 'P1P', state: 'OFFLINE', progress: 0,
      remaining_min: 0, filename: '', error_msg: '', last_seen: null,
    }])
  })

  it('fresh → state tersimpan; stale >10 menit → OFFLINE tapi field lain dipertahankan', () => {
    const store = new StateStore()
    const s = normalizeBambu('mars', { print: {
      gcode_state: 'FINISH', mc_percent: 100, mc_remaining_time: 0,
      subtask_name: 'Nike_Crocs_1.3 (flame)_5 color.gcode.3mf',
      print_error: 0, mc_print_error_code: '0', fail_reason: '0', hms: [] } })
    store.upsertFromStatus(mars, { ...s, eventTime: new Date(T0).toISOString() }, null)

    const fresh = buildPrintersPayload([mars], store, T0 + 5 * 60_000)
    expect(fresh.payload[0]).toMatchObject({
      name: 'Mars', type: 'P1P', state: 'finish', progress: 100, remaining_min: 0,
      filename: 'Nike_Crocs_1.3 (flame)_5 color.gcode.3mf',
      error_msg: 'print_error=0 | mc_print_error_code=0',
      last_seen: new Date(T0).toISOString(),
    })

    const stale = buildPrintersPayload([mars], store, T0 + 11 * 60_000)
    expect(stale.payload[0].state).toBe('OFFLINE')
    expect(stale.payload[0].progress).toBe(100) // data terakhir dipertahankan (paritas n8n)
  })

  it('urutan payload = urutan devices config; payload adalah array (bukan string)', () => {
    const p = buildPrintersPayload([gany, mars], new StateStore(), T0)
    expect(p.payload.map((r) => r.name)).toEqual(['Ganymede', 'Mars'])
    expect(Array.isArray(p.payload)).toBe(true)
  })

  it('upsert dgn event finished menyimpan last_state=finish (via storedStateFor)', () => {
    const store = new StateStore()
    const cur = normalizeBambu('mars', { print: { gcode_state: 'IDLE', mc_percent: 100 } })
    store.upsertFromStatus(mars, cur, 'finished')
    expect(store.get('mars')!.last_state).toBe('finish')
  })
})
