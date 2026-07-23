"use client"

import { useMemo } from "react"
import { hitungKalkulasiV2, type HasilKalkulasi } from "@3pb/kalkulator-core"
import { resolveInputV2, type ResolveDeps } from "@/lib/kalkulator/resolve-v2"
import type { KalkulasiInput } from "@/lib/kalkulator/types"

interface Props {
  input: KalkulasiInput
  deps: ResolveDeps
  hasil: HasilKalkulasi
  hargaShopeeAktual?: number
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
 * Panel debug: menampilkan perhitungan langkah demi langkah — jalur v2 PERSIS.
 * SUMBER ANGKA: resolveInputV2 (resolusi printer/material profile → acuan harga
 * jika ada) + hitungKalkulasiV2 dari @3pb/kalkulator-core — jalur yang sama
 * dipakai server (buildHasilV2). Panel hanya memformat; baris per-plate dihitung
 * ulang untuk display MENIRU formula-v2 plateCost persis, lalu DIREKONSILIASI
 * terhadap output formula — selisih > Rp1 memunculkan peringatan merah.
 */
export function RincianPanel({ input, deps, hasil, hargaShopeeAktual }: Props) {
  const rincian = useMemo(() => {
    try {
      const v2input = resolveInputV2(input, deps)
      const v2 = hitungKalkulasiV2(v2input, deps.settings)
      const spread = deps.settings.failureSpreadPct / 100
      const testPct = deps.settings.testLayerPct / 100
      const acuanGlobal = deps.printerProfiles.find(pp => pp.isPricingReference)

      const plateLines = v2input.plates.map((p, i) => {
        const src = input.plates[i]
        const profil = src.printerProfileId ? deps.printerProfiles.find(pp => pp.id === src.printerProfileId) : undefined
        const mesin = p.durasiJam * p.mesinPerJam
        const mesinJualRate = p.mesinPerJamJual ?? p.mesinPerJam
        const mesinJual = p.durasiJam * mesinJualRate

        let gramTotal = 0
        let failWeighted = 0
        const mats = p.materials.map((m, j) => {
          const srcMat = src.materials?.[j]
          const profilMat = m.materialProfileId ? deps.materialProfiles.find(mp => mp.id === m.materialProfileId) : undefined
          const override = srcMat ? srcMat.hargaPerGram : src.hargaPerGram
          const sumber = override != null ? "katalog/override"
            : profilMat ? `profil ${profilMat.nama}`
            : `default ${src.tipe ?? "FDM"}`
          const label = srcMat
            ? (`${srcMat.brand} ${srcMat.material}`.trim() || (profilMat?.nama ?? "material"))
            : (profilMat?.nama ?? src.tipe ?? "FDM")
          const jualRate = Math.max(m.jualPerGram, m.hppPerGram)
          gramTotal += m.gramasi
          failWeighted += m.gramasi * m.failureRatePct
          return {
            label, sumber, gramasi: m.gramasi, hppRate: m.hppPerGram, jualRate, rate: m.failureRatePct,
            hpp: m.gramasi * m.hppPerGram, jual: m.gramasi * jualRate,
          }
        })
        const matHpp = mats.reduce((s, m) => s + m.hpp, 0)
        const matJual = mats.reduce((s, m) => s + m.jual, 0)
        // Paritas persis formula-v2 plateCost: SATU rate per plate (customRiskPct ??
        // rata-rata tertimbang gramasi dari failureRatePct tiap material), dikalikan
        // ke (matHpp + mesin) SEKALIGUS — bukan penjumlahan biaya-gagal per material.
        const ratePlate = v2input.customRiskPct ?? (gramTotal > 0 ? failWeighted / gramTotal : 0)
        const failureCost = (matHpp + mesin) * (ratePlate / 100)
        const testCost = matHpp * testPct
        const plateHpp = matHpp + mesin + failureCost * (1 - spread) + testCost
        const plateJual = matJual + mesinJual + failureCost * spread
        return {
          nama: src.namaPart || `Part ${i + 1}`,
          durasiJam: p.durasiJam, mesinPerJam: p.mesinPerJam, mesin,
          mesinJualRate, mesinJual,
          sumberMesin: profil ? `profil ${profil.nama}` : "rate global",
          sumberMesinJual: p.mesinPerJamJual !== undefined
            ? `acuan ${(acuanGlobal ?? profil)?.nama ?? "-"}`
            : undefined,
          mats, matHpp, matJual, failureCost, testCost, plateHpp, plateJual, ratePlate,
        }
      })

      const sumHpp = plateLines.reduce((s, p) => s + p.plateHpp, 0)
      const sumJual = plateLines.reduce((s, p) => s + p.plateJual, 0)
      const totalGram = plateLines.reduce((s, p) => s + p.mats.reduce((g, m) => g + m.gramasi, 0), 0)
      const totalJam = plateLines.reduce((s, p) => s + p.durasiJam, 0)
      const batch = Math.max(1, v2input.batch)
      // Rekonsiliasi: baris display vs output formula core
      const mismatch = Math.abs(sumHpp / batch - v2.hppProduksi) > 1 || Math.abs(sumJual / batch - v2.jualBase) > 1
      // Fail% per-material ditampilkan hanya kalau tiap material bisa punya rate
      // berbeda (tak ada customRiskPct konstan yang meratakan semuanya).
      const showPerMatFail = v2input.customRiskPct === undefined

      return { v2input, v2, plateLines, sumHpp, sumJual, totalGram, totalJam, batch, spread, testPct, mismatch, showPerMatFail }
    } catch {
      return null
    }
  }, [input, deps])

  if (!rincian) return null
  const { v2input, v2, plateLines, sumHpp, sumJual, totalGram, totalJam, batch, spread, testPct, mismatch, showPerMatFail } = rincian
  const shopeeFee = deps.settings.channels.find(c => c.id === "shopee")?.feeMultiplier ?? deps.rates.adminEcommerce
  const m = deps.settings.marginMultipliers

  return (
    <details className="mt-3 rounded-[5px] px-3 py-2"
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
          <div key={i} className="rounded-[5px] px-2.5 py-2" style={{ border: "1px solid var(--g-inner-border)" }}>
            <div className="text-[11px] font-semibold g-t2 mb-1">{p.nama}</div>
            {p.mats.map((mt, j) => (
              <Row key={j} label={`Material ${mt.label}`}
                formula={`${num(mt.gramasi)} g × ${rp(mt.hppRate)}/g  [${mt.sumber}]${showPerMatFail ? ` · fail ${num(mt.rate)}%` : ""}`}
                value={rp(mt.hpp)} />
            ))}
            <Row label="Mesin" formula={`${num(p.durasiJam, 2)} j × ${rp(p.mesinPerJam)}/j  [${p.sumberMesin}]`} value={rp(p.mesin)} />
            {p.mesinJualRate !== p.mesinPerJam && (
              <Row label="Mesin (harga)" formula={`${num(p.durasiJam, 2)} j × ${rp(p.mesinJualRate)}/j  [${p.sumberMesinJual}]`} value={rp(p.mesinJual)} />
            )}
            <Row label={`Failure ${num(p.ratePlate)}%`}
              formula={`(${rp(p.matHpp)} + ${rp(p.mesin)}) × ${num(p.ratePlate)}% → HPP ${num((1 - spread) * 100, 0)}% / harga ${num(spread * 100, 0)}%`}
              value={rp(p.failureCost)} />
            {testPct > 0 && (
              <Row label={`Test layer ${num(testPct * 100, 0)}%`} formula={`${rp(p.matHpp)} × ${num(testPct * 100, 0)}%`} value={rp(p.testCost)} />
            )}
            <Row label="Subtotal" formula={`HPP plate · basis jual plate (jual/g ${p.mats.map(mt => rp(mt.jualRate)).join(", ")})`}
              value={`${rp(p.plateHpp)} · ${rp(p.plateJual)}`} />
          </div>
        ))}

        <div className="rounded-[5px] px-2.5 py-2" style={{ border: "1px solid var(--g-inner-border)" }}>
          <div className="text-[11px] font-semibold g-t2 mb-1">Agregasi ÷ batch {batch}</div>
          <Row label="Total run" formula={`${num(totalGram)} g · ${jamFmt(totalJam)} · HPP ${rp(sumHpp)} · jual ${rp(sumJual)}`} value="" />
          <Row label="Per unit" formula={`${num(totalGram / batch)} g · ${jamFmt(totalJam / batch)}`} value="" />
          <Row label="HPP produksi" formula={`${rp(sumHpp)} ÷ ${batch}`} value={rp(v2.hppProduksi)} />
          <Row label="Basis jual" formula={`${rp(sumJual)} ÷ ${batch}`} value={rp(v2.jualBase)} />
        </div>

        <div className="rounded-[5px] px-2.5 py-2" style={{ border: "1px solid var(--g-inner-border)" }}>
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

        <div className="rounded-[5px] px-2.5 py-2" style={{ border: "1px solid rgba(250,204,21,0.25)" }}>
          <div className="text-[11px] font-semibold g-t2 mb-1">Harga (angka final = panel Hasil di atas)</div>
          <Row label="HPP total" formula={`${rp(v2.hppProduksi)} + ${rp(v2.hppKomponen)} + labor(bulat) ${rp(Math.round(v2.hppLabor))}`} value={rp(hasil.hppTotal)} />
          <Row label="Floor price" formula={`${rp(v2.jualBase)} + ${rp(v2.hppKomponen)} + ${rp(Math.round(v2.hppLabor))}`} value={rp(hasil.floorPrice)} />
          <Row label="Offline A/B/C" formula={`floor × ${num(m.A, 2)} / ${num(m.B, 2)} / ${num(m.C, 2)}`}
            value={`${rp(hasil.offlineA)} · ${rp(hasil.offlineB)} · ${rp(hasil.offlineC)}`} />
          <Row label="Shopee A/B/C" formula={`offline × fee ${num(shopeeFee, 2)}`}
            value={`${rp(hasil.shopeeA)} · ${rp(hasil.shopeeB)} · ${rp(hasil.shopeeC)}`} />
          <Row label="Reseller" formula={`std = offline A · bulk = floor × ${num(deps.rates.resellerBulkMultiplier, 2)}`}
            value={`${rp(hasil.resellerStd)} · ${rp(hasil.resellerBulk)}`} />
          {hargaShopeeAktual !== undefined && (
            <Row label={`Status ${hasil.status}`}
              formula={`harga aktual ${rp(hargaShopeeAktual)} vs Shopee Kompetitif ${rp(hasil.shopeeA)} & floor ${rp(hasil.floorPrice)}`}
              value="" />
          )}
        </div>
      </div>
    </details>
  )
}
