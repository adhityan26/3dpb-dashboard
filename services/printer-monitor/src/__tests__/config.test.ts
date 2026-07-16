import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadConfig } from '../config'

const example = JSON.parse(readFileSync(new URL('../../config.example.json', import.meta.url), 'utf8'))

describe('loadConfig', () => {
  it('config.example.json valid; device bambu tanpa ip/accessCode di-SKIP dgn alasan, moonraker jalan', () => {
    const { config, skipped } = loadConfig(example)
    expect(config.broker.url).toBe('mqtt://192.168.88.113:1883')
    expect(config.devices.map((d) => d.id)).toEqual(['ganymede']) // hanya yg lengkap
    expect(skipped).toHaveLength(9)
    expect(skipped[0]).toMatchObject({ id: 'jupiter', reason: expect.stringContaining('ip') })
  })
  it('device bambu lengkap ikut jalan', () => {
    const raw = { ...example, devices: [{ ...example.devices[5], ip: '10.0.0.9', accessCode: 'x' }] }
    const { config, skipped } = loadConfig(raw)
    expect(config.devices.map((d) => d.id)).toEqual(['mars'])
    expect(skipped).toHaveLength(0)
  })
  it('broker.url wajib', () => {
    expect(() => loadConfig({ devices: [] })).toThrow(/broker\.url/)
  })
  it('connector tak dikenal (typo) → SKIP dgn reason, TIDAK lolos jadi moonraker', () => {
    const raw = { ...example, devices: [{ id: 'x', name: 'X', type: 'P1P', connector: 'bambuu', ip: '10.0.0.9' }] }
    const { config, skipped } = loadConfig(raw)
    expect(config.devices).toHaveLength(0)
    expect(skipped).toEqual([{ id: 'x', reason: 'connector tidak dikenal: bambuu' }])
  })
})
