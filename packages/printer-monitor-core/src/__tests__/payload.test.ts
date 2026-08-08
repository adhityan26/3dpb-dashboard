import { describe, it, expect } from 'vitest'
import { StateStore } from '../state-store'
import { buildPrintersPayload } from '../payload'
import { normalizeBambu } from '../normalize-bambu'
import { HmsLookup } from '../hms'
import type { DeviceConfig } from '../types'

const mars: DeviceConfig = { id: 'mars', name: 'Mars', type: 'P1P', connector: 'bambu', ip: '10.0.0.9', serial: '01S00A2C0502433', accessCode: 'x' }
const gany: DeviceConfig = { id: 'ganymede', name: 'Ganymede', type: 'U1', connector: 'moonraker', ip: '192.168.88.40' }

const T0 = Date.parse('2026-07-16T00:50:00.000Z')

describe('StateStore + buildPrintersPayload', () => {
  it('device tanpa data → OFFLINE, field default', () => {
    const p = buildPrintersPayload([mars], new StateStore(), T0)
    expect(p.payload).toEqual([{
      id: 'mars',
      name: 'Mars', type: 'P1P', state: 'OFFLINE', progress: 0,
      remaining_min: 0, filename: '', error_msg: '', error_message: '', last_seen: null,
      nozzle_temp: 0, bed_temp: 0,
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

  it('nozzle_temp/bed_temp mengalir dari NormalizedStatus sampai ke PrinterRow', () => {
    const store = new StateStore()
    const s = normalizeBambu('mars', { print: {
      gcode_state: 'RUNNING', mc_percent: 50, nozzle_temper: 219.6, bed_temper: 59.8 } })
    store.upsertFromStatus(mars, s, null)

    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0]).toMatchObject({ nozzle_temp: 220, bed_temp: 60 })
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

  it('payload includes stable device id (bukan cuma display name)', () => {
    const store = new StateStore()
    store.upsertFromStatus(mars, normalizeBambu('mars', { print: { gcode_state: 'IDLE' } }), null)
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].id).toBe('mars')
    expect(p.payload[0].name).toBe('Mars')
  })

  it('error_message terisi dari HmsLookup kalau state error dgn entri HMS; error_msg lama tetap ada', () => {
    const hms = new HmsLookup({ '1201_8007': 'Extruder clogged.' })
    const store = new StateStore(hms)
    const s = normalizeBambu('mars', { print: {
      gcode_state: 'FAILED', print_error: 117473285, mc_print_error_code: '0',
      hms: [{ attr: 0x12018007, code: 66 }] } })
    store.upsertFromStatus(mars, s, 'error')
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].error_message).toBe('[1201_8007] Extruder clogged.')
    expect(p.payload[0].error_msg).toContain('print_error=117473285')
  })

  it('error_message fallback kode print_error kalau HMS kosong', () => {
    const store = new StateStore(new HmsLookup({}))
    const s = normalizeBambu('mars', { print: {
      gcode_state: 'FAILED', print_error: 5, mc_print_error_code: '0', hms: [] } })
    store.upsertFromStatus(mars, s, 'error')
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].error_message).toBe('Print error (kode 5)')
  })

  it('error_message kosong kalau state bukan error', () => {
    const store = new StateStore()
    const s = normalizeBambu('mars', { print: { gcode_state: 'RUNNING', mc_percent: 50 } })
    store.upsertFromStatus(mars, s, null)
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].error_message).toBe('')
  })

  // Kasus nyata (relay dari sesi firmware CYD, printer "Uranus" P1S, 2026-08-09): Bambu
  // kadang lapor gcode_state=PAUSE walau print_error-nya non-zero (genuinely error, bukan
  // pause manual biasa) -- state==='error' literal saja TIDAK menangkap ini, error_message
  // jadi kosong padahal firmware CYD sudah siap tampilkan pesannya kalau field-nya terisi.
  it('state PAUSE tapi print_error non-zero -> tetap dianggap error, error_message terisi', () => {
    const store = new StateStore(new HmsLookup({}))
    const s = normalizeBambu('mars', { print: {
      gcode_state: 'PAUSE', print_error: 117473297, mc_print_error_code: '0', hms: [] } })
    store.upsertFromStatus(mars, s, null)
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].state).toBe('pause') // state APA ADANYA dari Bambu, tak diubah paksa
    expect(p.payload[0].error_message).toBe('Print error (kode 117473297)')
  })

  it('state PAUSE dgn print_error=0 (pause manual biasa) -> error_message TETAP kosong (bukan regresi)', () => {
    const store = new StateStore()
    const s = normalizeBambu('mars', { print: { gcode_state: 'PAUSE', print_error: 0 } })
    store.upsertFromStatus(mars, s, null)
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].error_message).toBe('')
  })
})
