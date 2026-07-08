import { hitungMesinPerJam } from './printer'

describe('hitungMesinPerJam', () => {
  it('listrik + depresiasi + maintenance', () => {
    // 300W × Rp1500/kWh = 450; Rp6.000.000 / 6000 jam = 1000; maintenance 100
    expect(hitungMesinPerJam({ watt: 300, tarifPerKwh: 1500, hargaPrinter: 6_000_000, umurPakaiJam: 6000, maintenancePerJam: 100 })).toBeCloseTo(1550)
  })

  it('maintenance opsional default 0', () => {
    expect(hitungMesinPerJam({ watt: 300, tarifPerKwh: 1500, hargaPrinter: 6_000_000, umurPakaiJam: 6000 })).toBeCloseTo(1450)
  })
})
