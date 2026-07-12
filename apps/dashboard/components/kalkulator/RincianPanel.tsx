"use client"

import { useMemo } from "react"
import {
  hitungKalkulasiV2, legacyPlateToV2, legacyKomponenToV2, helmToLabor, legacySettingsToV2,
  type KalkulatorRates, type HelmOptions, type PlateInput, type LegacyAksesori, type HasilKalkulasi,
} from "@3pb/kalkulator-core"

interface Props {
  plates: PlateInput[]
  aksesori: LegacyAksesori
  batch: number
  rates: KalkulatorRates
  hasil: HasilKalkulasi
  hargaShopeeAktual?: number
  customRiskPct?: number
  helmOptions?: HelmOptions
}

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`
const num = (n: number, d = 1) => n.toLocaleString("id-ID", { maximumFractionDigits: d })
const jamFmt = (j: number) => {
  const m = Math.round(j * 60)
  return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m`
}

function Row({ label, formula, value, dim }: { label: string; formula?: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5" style={{ opacity: dim ? 0.65 : 1 }}>
      <span className="text-[11px] g-t3 w-24 flex-shrink-0">{label}</span>
      <span className="text-[11px] g-t4 flex-1 font-mono break-all">{formula}</span>
      <span className="text-[11px] font-mono g-t1 flex-shrink-0">{value}</span>
    </div>
  )
}

/**
 * Panel debug: menampilkan perhitungan langkah demi langkah.
 * SUMBER ANGKA: adapter legacy→v2 + hitungKalkulasiV2 dari @3pb/kalkulator-core —
 * persis jalur yang dipakai hitungKalkulasi (golden-tested). Panel hanya memformat;
 * baris per-plate dihitung ulang untuk display lalu DIREKONSILIASI terhadap output
 * formula — selisih > Rp1 memunculkan peringatan merah.
 */
export function RincianPanel({ plates, aksesori, batch, rates, hasil, hargaShopeeAktual, customRiskPct, helmOptions }: Props) {
  const rincian = useMemo(() => {
    try {
      const v2input = {
        plates: plates.map(p => legacyPlateToV2(p, rates)),
        batch,
        komponen: legacyKomponenToV2(aksesori, rates),
        labor: helmToLabor(helmOptions),
        // paritas wrapper: rate konstan diteruskan (buffer tetap kena mesin meski 0 gram)
        customRiskPct: customRiskPct ?? rates.failureRatePct,
      }
      const settings = legacySettingsToV2(rates)
      const v2 = hitungKalkulasiV2(v2input, settings)
      const spread = settings.failureSpreadPct / 100
      const testPct = settings.testLayerPct / 100
      const failRate = v2input.customRiskPct

      const plateLines = v2input.plates.map((p, i) => {
        const src = plates[i]
        const mesin = p.durasiJam * p.mesinPerJam
        const mats = p.materials.map((m, j) => {
          const override = src.materials?.[j]?.hargaPerGram ?? (src.materials ? undefined : src.hargaPerGram)
          const label = src.materials?.[j]
            ? `${src.materials[j].brand} ${src.materials[j].material}`
            : (src.tipe ?? "FDM")
          return {
            label,
            sumber: override != null ? "katalog/override" : `default ${src.tipe ?? "FDM"}`,
            gramasi: m.gramasi,
            hppRate: m.hppPerGram,
            jualRate: Math.max(m.jualPerGram, m.hppPerGram),
            hpp: m.gramasi * m.hppPerGram,
            jual: m.gramasi * Math.max(m.jualPerGram, m.hppPerGram),
          }
        })
        const matHpp = mats.reduce((s, m) => s + m.hpp, 0)
        const matJual = mats.reduce((s, m) => s + m.jual, 0)
        const failureCost = (matHpp + mesin) * (failRate / 100)
        const testCost = matHpp * testPct
        const plateHpp = matHpp + mesin + failureCost * (1 - spread) + testCost
        const plateJual = matJual + mesin + failureCost * spread
        return {
          nama: src.namaPart || `Part ${i + 1}`,
          durasiJam: p.durasiJam, mesinPerJam: p.mesinPerJam, mesin,
          mats, matHpp, matJual, failureCost, testCost, plateHpp, plateJual,
        }
      })

      const sumHpp = plateLines.reduce((s, p) => s + p.plateHpp, 0)
      const sumJual = plateLines.reduce((s, p) => s + p.plateJual, 0)
      const totalGram = plateLines.reduce((s, p) => s + p.mats.reduce((g, m) => g + m.gramasi, 0), 0)
      const totalJam = plateLines.reduce((s, p) => s + p.durasiJam, 0)
      // Rekonsiliasi: baris display vs output formula core
      const mismatch = Math.abs(sumHpp / batch - v2.hppProduksi) > 1 || Math.abs(sumJual / batch - v2.jualBase) > 1

      return { v2input, settings, v2, plateLines, sumHpp, sumJual, totalGram, totalJam, failRate, spread, testPct, mismatch }
    } catch {
      return null
    }
  }, [plates, aksesori, batch, rates, customRiskPct, helmOptions])

  if (!rincian) return null
  const { v2input, settings, v2, plateLines, sumHpp, sumJual, totalGram, totalJam, failRate, spread, testPct, mismatch } = rincian
  const shopeeFee = settings.channels.find(c => c.id === "shopee")?.feeMultiplier ?? rates.adminEcommerce
  const m = settings.marginMultipliers

  return (
    <details className="mt-3 rounded-[10px] px-3 py-2"
             style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
      <summary className="text-[11px] font-semibold g-t2 cursor-pointer select-none">
        🔍 Rincian Perhitungan (debug)
      </summary>

      {mismatch && (
        <div className="text-[11px] text-red-400 mt-2 font-semibold">
          ⚠️ Rekonsiliasi gagal: baris rincian ≠ hasil formula — jangan pakai panel ini, laporkan bug.
        </div>
      )}

      <div className="mt-2 space-y-3">
        {plateLines.map((p, i) => (
          <div key={i} className="rounded-[8px] px-2.5 py-2" style={{ border: "1px solid var(--g-inner-border)" }}>
            <div className="text-[11px] font-semibold g-t2 mb-1">{p.nama}</div>
            {p.mats.map((mt, j) => (
              <Row key={j} label={`Material ${mt.label}`}
                formula={`${num(mt.gramasi)} g × ${rp(mt.hppRate)}/g  [${mt.sumber}]`}
                value={rp(mt.hpp)} />
            ))}
            <Row label="Mesin" formula={`${num(p.durasiJam, 2)} j × ${rp(p.mesinPerJam)}/j`} value={rp(p.mesin)} />
            <Row label={`Failure ${num(failRate)}%`}
              formula={`(${rp(p.matHpp)} + ${rp(p.mesin)}) × ${num(failRate)}% → HPP ${num((1 - spread) * 100, 0)}% / harga ${num(spread * 100, 0)}%`}
              value={rp(p.failureCost)} />
            {testPct > 0 && (
              <Row label={`Test layer ${num(testPct * 100, 0)}%`} formula={`${rp(p.matHpp)} × ${num(testPct * 100, 0)}%`} value={rp(p.testCost)} />
            )}
            <Row label="Subtotal" formula={`HPP plate · basis jual plate (jual/g ${p.mats.map(mt => rp(mt.jualRate)).join(", ")})`}
              value={`${rp(p.plateHpp)} · ${rp(p.plateJual)}`} />
          </div>
        ))}

        <div className="rounded-[8px] px-2.5 py-2" style={{ border: "1px solid var(--g-inner-border)" }}>
          <div className="text-[11px] font-semibold g-t2 mb-1">Agregasi ÷ batch {batch}</div>
          <Row label="Total run" formula={`${num(totalGram)} g · ${jamFmt(totalJam)} · HPP ${rp(sumHpp)} · jual ${rp(sumJual)}`} value="" />
          <Row label="Per unit" formula={`${num(totalGram / batch)} g · ${jamFmt(totalJam / batch)}`} value="" />
          <Row label="HPP produksi" formula={`${rp(sumHpp)} ÷ ${batch}`} value={rp(v2.hppProduksi)} />
          <Row label="Basis jual" formula={`${rp(sumJual)} ÷ ${batch}`} value={rp(v2.jualBase)} />
        </div>

        <div className="rounded-[8px] px-2.5 py-2" style={{ border: "1px solid var(--g-inner-border)" }}>
          <div className="text-[11px] font-semibold g-t2 mb-1">Komponen &amp; Labor (per unit)</div>
          {v2input.komponen.length === 0 && v2input.labor.length === 0 && (
            <div className="text-[11px] g-t5">Tidak ada.</div>
          )}
          {v2input.komponen.map((k, i) => (
            <Row key={`k${i}`} label={k.nama} formula={k.qty > 1 ? `${rp(k.harga)} × ${k.qty}` : undefined} value={rp(k.harga * k.qty)} />
          ))}
          {v2input.labor.map((l, i) => (
            <Row key={`l${i}`} label={`Labor: ${l.nama}`}
              formula={l.jam != null ? `${num(l.jam, 2)} j × ${rp(l.ratePerJam ?? 0)}/j` : "flat"}
              value={rp((l.jam ?? 0) * (l.ratePerJam ?? 0) + (l.flat ?? 0))} />
          ))}
          {(v2input.komponen.length > 0 || v2input.labor.length > 0) && (
            <Row label="Subtotal" value={`${rp(v2.hppKomponen)} + labor ${rp(v2.hppLabor)}`} />
          )}
        </div>

        <div className="rounded-[8px] px-2.5 py-2" style={{ border: "1px solid rgba(250,204,21,0.25)" }}>
          <div className="text-[11px] font-semibold g-t2 mb-1">Harga (angka final = panel Hasil di atas)</div>
          <Row label="HPP total" formula={`${rp(v2.hppProduksi)} + ${rp(v2.hppKomponen)} + labor(bulat) ${rp(Math.round(v2.hppLabor))}`} value={rp(hasil.hppTotal)} />
          <Row label="Floor price" formula={`${rp(v2.jualBase)} + ${rp(v2.hppKomponen)} + ${rp(Math.round(v2.hppLabor))}`} value={rp(hasil.floorPrice)} />
          <Row label="Offline A/B/C" formula={`floor × ${num(m.A, 2)} / ${num(m.B, 2)} / ${num(m.C, 2)}`}
            value={`${rp(hasil.offlineA)} · ${rp(hasil.offlineB)} · ${rp(hasil.offlineC)}`} />
          <Row label="Shopee A/B/C" formula={`offline × fee ${num(shopeeFee, 2)}`}
            value={`${rp(hasil.shopeeA)} · ${rp(hasil.shopeeB)} · ${rp(hasil.shopeeC)}`} />
          <Row label="Reseller" formula={`std = offline A · bulk = floor × ${num(rates.resellerBulkMultiplier, 2)}`}
            value={`${rp(hasil.resellerStd)} · ${rp(hasil.resellerBulk)}`} />
          {hargaShopeeAktual !== undefined && (
            <Row label={`Status ${hasil.status}`}
              formula={`harga aktual ${rp(hargaShopeeAktual)} vs Shopee A ${rp(hasil.shopeeA)} & floor ${rp(hasil.floorPrice)}`}
              value="" />
          )}
        </div>
      </div>
    </details>
  )
}
