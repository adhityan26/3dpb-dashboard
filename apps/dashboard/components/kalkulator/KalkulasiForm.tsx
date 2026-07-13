"use client"

import { useState, useMemo } from "react"
import { PlateTable } from "./PlateTable"
import { AksesoriSection } from "./AksesoriSection"
import { HasilPanel } from "./HasilPanel"
import { hitungKalkulasi } from "@3pb/kalkulator-core"
import { useCreateKalkulasi, useUpdateKalkulasi, useKalkulatorRates } from "@/lib/hooks/use-kalkulator"
import { useKatalogList } from "@/lib/hooks/use-katalog"
import { useProducts } from "@/lib/hooks/use-products"
import type { KalkulasiData, KalkulasiInput, MarginTier, HasilKalkulasi, ProduktType, FinishType } from "@/lib/kalkulator/types"
import { HELM_TIER_DEFAULTS } from "@/lib/kalkulator/types"
import type { AksesoriState } from "./AksesoriSection"
import { PrintableQuote } from "./PrintableQuote"
import { RincianPanel } from "./RincianPanel"

interface PlateRow {
  key: string
  namaPart?: string
  tipe?: "FDM" | "SLA"
  printer?: string
  gramasi?: number
  materials?: import("@/lib/kalkulator/types").FilamentEntry[]
  durasiJam: number
}

const DEFAULT_AKSESORI: AksesoriState = {
  packingType: undefined,
  gantunganType: undefined,
  switchQty: 0,
  hasLabel: false,
  komponenKustom: [],
}

const DEFAULT_PLATE: PlateRow = { key: "plate-init-1", tipe: "FDM", gramasi: 0, durasiJam: 0 }

interface Props {
  initial?: KalkulasiData          // load existing for edit
  onSaved?: (k: KalkulasiData) => void
}

export function KalkulasiForm({ initial, onSaved }: Props) {
  const { data: ratesData } = useKalkulatorRates()
  const createMut = useCreateKalkulasi()
  const updateMut = useUpdateKalkulasi()
  const { data: katalogList } = useKatalogList()
  const { data: productsData } = useProducts()

  // Find if this kalkulasi is set as primary HPP source for any katalog product
  // If yes and that product has Shopee links → auto-fill harga shopee from actual Shopee price
  const linkedShopeePrice = useMemo(() => {
    if (!initial?.id || !katalogList || !productsData?.products) return null
    const katalog = katalogList.find(k => k.primaryKalkulasiId === initial.id)
    if (!katalog || !katalog.shopeeLinks.length) return null
    const linkedIds = new Set(katalog.shopeeLinks.map(l => l.shopeeItemId))
    const prices = productsData.products
      .filter(p => linkedIds.has(p.productId) && p.priceMin > 0)
      .map(p => p.priceMin)
    return prices.length > 0 ? Math.min(...prices) : null
  }, [initial?.id, katalogList, productsData])

  const shopeeIsLocked = linkedShopeePrice != null

  const [nama, setNama] = useState(initial?.nama ?? "")
  const [batch, setBatch] = useState(initial?.batch ?? 1)
  const [marginTier, setMarginTier] = useState<MarginTier>(initial?.marginTier ?? "A")
  const [hargaShopee, setHargaShopee] = useState<number | undefined>(initial?.hargaShopeeAktual ?? undefined)
  const [hargaShopeeStr, setHargaShopeeStr] = useState(initial?.hargaShopeeAktual ? String(initial.hargaShopeeAktual) : "")
  const [hargaOffline, setHargaOffline] = useState<number | undefined>(initial?.hargaOfflineAktual ?? undefined)
  const [hargaOfflineStr, setHargaOfflineStr] = useState(initial?.hargaOfflineAktual ? String(initial.hargaOfflineAktual) : "")
  const [plates, setPlates] = useState<PlateRow[]>(
    initial?.plates.map(p => ({
      key: `p-${p.id}`,
      namaPart: p.namaPart ?? undefined,
      tipe: p.tipe as "FDM" | "SLA",
      printer: p.printer ?? undefined,
      gramasi: p.gramasi ?? 0,
      materials: p.materials,
      durasiJam: p.durasiJam,
    })) ?? [DEFAULT_PLATE]
  )
  const [customRiskEnabled, setCustomRiskEnabled] = useState(false)
  const [customRiskPct, setCustomRiskPct] = useState<number>(12)

  // Helm fields
  const [produktType, setProduktType] = useState<ProduktType>(initial?.produktType ?? 'SIMPLE')
  const [finishType, setFinishType] = useState<FinishType>(initial?.finishType ?? 'RAW')
  const [jamSanding, setJamSanding] = useState<number>(initial?.jamSanding ?? 0)
  const [jamPainting, setJamPainting] = useState<number>(initial?.jamPainting ?? 0)
  const [jamAssembly, setJamAssembly] = useState<number>(initial?.jamAssembly ?? 0)
  const [flatFinishingCost, setFlatFinishingCost] = useState<number>(initial?.flatFinishingCost ?? 0)

  const [aksesori, setAksesori] = useState<AksesoriState>(
    initial
      ? {
          packingType: initial.packingType,
          gantunganType: initial.gantunganType ?? undefined,
          switchQty: initial.switchQty,
          hasLabel: initial.hasLabel,
          komponenKustom: initial.komponenKustom.map(k => ({
            id: k.id,
            nama: k.nama,
            harga: k.harga,
            qty: k.qty,
          })),
        }
      : DEFAULT_AKSESORI
  )

  // Real-time calculation — no API call
  const hasil: HasilKalkulasi | null = useMemo(() => {
    if (!ratesData) return null
    const validPlates = plates.filter(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0) && p.durasiJam > 0)
    const hasKomponen = aksesori.komponenKustom.some(k => k.harga > 0)
    if (validPlates.length === 0 && !hasKomponen) return null
    try {
      return hitungKalkulasi(
        validPlates,
        {
          packingType: aksesori.packingType,
          gantunganType: aksesori.gantunganType,
          switchQty: aksesori.switchQty,
          hasLabel: aksesori.hasLabel,
          komponenKustom: aksesori.komponenKustom,
        },
        Math.max(1, batch),
        ratesData,
        // Use actual Shopee price from linked product if available, otherwise manual input
        (shopeeIsLocked ? linkedShopeePrice : hargaShopee) ?? undefined,
        customRiskEnabled ? customRiskPct : undefined,
        produktType === 'HELM' ? {
          finishType,
          jamSanding,
          jamPainting,
          jamAssembly,
          flatFinishingCost,
          preparerRatePerJam: ratesData.preparerRatePerJam,
          finisherRatePerJam: ratesData.finisherRatePerJam,
        } : undefined
      )
    } catch { return null }
  }, [plates, aksesori, batch, hargaShopee, shopeeIsLocked, linkedShopeePrice, ratesData, customRiskEnabled, customRiskPct, produktType, finishType, jamSanding, jamPainting, jamAssembly, flatFinishingCost])

  // Round up to nearest 5000 for placeholder suggestions
  function roundUp5000(n: number): number {
    return Math.ceil(n / 5000) * 5000
  }
  const placeholderShopee = hasil ? `Rp ${roundUp5000(hasil.shopeeA).toLocaleString("id-ID")}` : "Rp 35.000"
  const placeholderOffline = hasil ? `Rp ${roundUp5000(hasil.offlineA).toLocaleString("id-ID")}` : "Rp 30.000"

  const isEditing = !!initial

  async function handleSave() {
    const hasPlates = plates.some(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0))
    const hasKomponenVal = aksesori.komponenKustom.some(k => k.harga > 0)
    if (!nama.trim() || (!hasPlates && !hasKomponenVal)) return
    const input: KalkulasiInput = {
      nama: nama.trim(),
      batch: Math.max(1, batch),
      marginTier,
      hargaShopeeAktual: hargaShopee && hargaShopee > 0 ? hargaShopee : undefined,
      hargaOfflineAktual: hargaOffline && hargaOffline > 0 ? hargaOffline : undefined,
      packingType: aksesori.packingType,
      gantunganType: aksesori.gantunganType,
      switchQty: aksesori.switchQty,
      hasLabel: aksesori.hasLabel,
      plates: plates.filter(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0)).map(p => ({
        namaPart: p.namaPart,
        tipe: p.tipe,
        printer: p.printer,
        gramasi: p.gramasi ?? 0,
        materials: p.materials,
        durasiJam: p.durasiJam,
      })),
      komponenKustom: aksesori.komponenKustom
        .filter(k => k.nama && k.harga > 0)
        .map(k => ({
          nama: k.nama,
          harga: k.harga,
          qty: k.qty,
        })),
      customRiskPct: customRiskEnabled ? customRiskPct : undefined,
      produktType,
      finishType,
      jamSanding,
      jamPainting,
      jamAssembly,
      flatFinishingCost,
    }

    let saved: KalkulasiData
    if (isEditing && initial) {
      saved = await updateMut.mutateAsync({ id: initial.id, input })
    } else {
      saved = await createMut.mutateAsync(input)
    }
    onSaved?.(saved)
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const hasValidInput = nama.trim().length > 0 && (
    plates.some(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0)) ||
    aksesori.komponenKustom.some(k => k.harga > 0)
  )
  const [showPrint, setShowPrint] = useState(false)

  // Fallback rates for AksesoriSection while ratesData is loading
  const aksesoriRates = ratesData ?? {
    packing: { S: 1500, M: 2500, L: 5000, XL: 8000 },
    gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 },
    switchPerPcs: 2500,
    labelPerLembar: 750,
  }

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* LEFT: Input */}
      <div className="space-y-5">

        {/* Nama + Batch + Margin */}
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5 g-accent">
              Nama Kalkulasi
            </div>
            <input
              type="text"
              placeholder='e.g. "Flexi Shark 10pcs"'
              value={nama}
              onChange={e => setNama(e.target.value)}
              className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5 g-accent">
                Batch (unit)
              </div>
              <input
                type="number"
                min="1"
                value={batch}
                onChange={e => setBatch(parseInt(e.target.value) || 1)}
                className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
              />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5 g-accent">
                Margin
              </div>
              <div className="flex gap-2">
                {(["A", "B", "C"] as MarginTier[]).map(tier => (
                  <button
                    key={tier}
                    onClick={() => setMarginTier(tier)}
                    className="flex-1 h-10 rounded-[8px] text-sm font-bold transition-all"
                    style={
                      marginTier === tier
                        ? {
                            background: "rgba(99,102,241,0.3)",
                            border: "1px solid rgba(99,102,241,0.5)",
                            color: "#c7d2fe",
                          }
                        : {
                            background: "var(--g-inner)",
                            border: "1px solid var(--g-inner-border)",
                            color: "var(--g-t3)",
                          }
                    }
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Plate Table */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">
            Part / Plate
          </div>
          <PlateTable plates={plates} onChange={setPlates} batch={Math.max(1, batch)} />
        </div>

        {/* Aksesori */}
        <AksesoriSection value={aksesori} onChange={setAksesori} rates={aksesoriRates} />

        {/* Harga Shopee */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider g-accent">
              Harga Shopee Saat Ini
            </div>
            {shopeeIsLocked ? (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}
              >
                🔗 Dari Shopee
              </span>
            ) : (
              <span className="text-[10px] font-normal g-t5">
                (opsional)
              </span>
            )}
          </div>
          <input
            type="text"
            placeholder={placeholderShopee}
            value={shopeeIsLocked ? `Rp ${linkedShopeePrice!.toLocaleString("id-ID")}` : hargaShopeeStr}
            disabled={shopeeIsLocked}
            onChange={shopeeIsLocked ? undefined : e => {
              setHargaShopeeStr(e.target.value)
              const n = parseInt(e.target.value.replace(/\D/g, ""))
              setHargaShopee(n > 0 ? n : undefined)
            }}
            className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
            style={shopeeIsLocked ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
          />
        </div>

        {/* Harga Offline Aktual */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider g-accent">
              Harga Offline Saat Ini
            </div>
            <span className="text-[10px] font-normal g-t5">(opsional)</span>
          </div>
          <input
            type="text"
            placeholder={placeholderOffline}
            value={hargaOfflineStr}
            onChange={e => {
              setHargaOfflineStr(e.target.value)
              const n = parseInt(e.target.value.replace(/\D/g, ""))
              setHargaOffline(n > 0 ? n : undefined)
            }}
            className="glass-input w-full h-10 rounded-[10px] px-3 text-sm"
          />
        </div>

        {/* Custom Risk % */}
        <div className="rounded-[10px] px-3 py-2.5 space-y-2" style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium g-t2">⚠️ Custom Failure Rate</span>
              <span className="text-[10px] g-t5 ml-2">(override global setting)</span>
            </div>
            <button
              onClick={() => setCustomRiskEnabled(v => !v)}
              className="text-[10px] px-2.5 py-1 rounded-md transition-colors font-medium"
              style={customRiskEnabled
                ? { background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5" }
                : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t4)" }}
            >
              {customRiskEnabled ? "✓ Aktif" : "Nonaktif"}
            </button>
          </div>
          {customRiskEnabled && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] g-t4">Failure rate untuk job ini</span>
                <span className="text-xs font-mono" style={{ color: "#fca5a5" }}>{customRiskPct}%</span>
              </div>
              <input
                type="range" min="0" max="50" step="1"
                value={customRiskPct}
                onChange={e => setCustomRiskPct(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: "#f87171" }}
              />
              <div className="flex justify-between text-[10px] g-t5 mt-0.5">
                <span>0% = tidak ada risiko gagal</span>
                <span>50% = high risk</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Tipe Produk ─────────────────────────────────────────── */}
        <div className="space-y-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
            Tipe Produk
          </div>
          <div className="flex gap-2">
            {(['SIMPLE', 'HELM'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setProduktType(t)
                  if (t === 'SIMPLE') {
                    setFinishType('RAW')
                  } else if (t === 'HELM' && flatFinishingCost === 0) {
                    setFlatFinishingCost(ratesData?.helmConsumablesDefault ?? 55000)
                  }
                }}
                className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all"
                style={{
                  background: produktType === t ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${produktType === t ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}`,
                  color: produktType === t ? "#a5b4fc" : "rgba(255,255,255,0.45)",
                }}
              >
                {t === 'SIMPLE' ? '🧸 Mainan / Keychain' : '🪖 Helm / Topeng'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Helm Finishing (hanya muncul kalau HELM) ─────────────── */}
        {produktType === 'HELM' && (
          <div className="space-y-4 p-4 rounded-[12px]" style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
            {/* Finish Type */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.6)" }}>
                Finish Type
              </div>
              <div className="flex gap-2">
                {(['RAW', 'FINISHING'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFinishType(f)}
                    className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all"
                    style={{
                      background: finishType === f ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${finishType === f ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}`,
                      color: finishType === f ? "#a5b4fc" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {f === 'RAW' ? '🔩 RAW (as-is)' : '🎨 FINISHING'}
                  </button>
                ))}
              </div>
            </div>

            {/* Labor sections — hanya kalau FINISHING */}
            {finishType === 'FINISHING' && (
              <div className="space-y-4">
                {/* Tier quick-pick */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.6)" }}>
                    Tier Preset
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(['MINIMAL', 'LIGHT', 'MEDIUM', 'HEAVY'] as const).map(tier => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => {
                          const d = HELM_TIER_DEFAULTS[tier]
                          setJamSanding(d.jamSanding)
                          setJamPainting(d.jamPainting)
                          setJamAssembly(d.jamAssembly)
                        }}
                        className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium transition-all hover:opacity-80"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Klik tier untuk auto-fill jam. Angka bisa diedit bebas.
                  </div>
                </div>

                {/* Labor inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                      🪵 Preparer — Sanding (jam)
                      <span className="ml-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>@Rp35.000</span>
                    </label>
                    <input
                      type="number" min={0} step={0.25}
                      value={jamSanding || ''}
                      onChange={e => setJamSanding(Number(e.target.value))}
                      className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                      🎨 Finisher — Painting (jam)
                      <span className="ml-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>@Rp75.000</span>
                    </label>
                    <input
                      type="number" min={0} step={0.25}
                      value={jamPainting || ''}
                      onChange={e => setJamPainting(Number(e.target.value))}
                      className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                      🔩 Preparer — Assembly (jam)
                      <span className="ml-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>@Rp35.000</span>
                    </label>
                    <input
                      type="number" min={0} step={0.25}
                      value={jamAssembly || ''}
                      onChange={e => setJamAssembly(Number(e.target.value))}
                      className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                      🎨 Consumables (Rp)
                    </label>
                    <input
                      type="number" min={0} step={1000}
                      value={flatFinishingCost || ''}
                      onChange={e => setFlatFinishingCost(Number(e.target.value))}
                      className="glass-input w-full h-9 rounded-[10px] px-3 text-sm"
                      placeholder="55000"
                    />
                  </div>
                </div>

                {/* Warning: consumables = 0 */}
                {flatFinishingCost === 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] text-[11px]"
                    style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                    ⚠️ Biaya consumables (cat, primer) belum diisi — sudah di-include di tempat lain?
                  </div>
                )}

                {/* Real-time breakdown */}
                {(jamSanding > 0 || jamPainting > 0 || jamAssembly > 0 || flatFinishingCost > 0) && (
                  <div className="rounded-[8px] p-3 space-y-1 text-[11px] font-mono"
                    style={{ background: "rgba(10,8,40,0.6)", border: "1px solid rgba(99,102,241,0.15)" }}>
                    {jamSanding > 0 && (
                      <div className="flex justify-between">
                        <span style={{ color: "rgba(255,255,255,0.4)" }}>Sanding {jamSanding}j × Rp35.000</span>
                        <span style={{ color: "#a5b4fc" }}>Rp {(jamSanding * 35000).toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {jamPainting > 0 && (
                      <div className="flex justify-between">
                        <span style={{ color: "rgba(255,255,255,0.4)" }}>Painting {jamPainting}j × Rp75.000</span>
                        <span style={{ color: "#a5b4fc" }}>Rp {(jamPainting * 75000).toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {jamAssembly > 0 && (
                      <div className="flex justify-between">
                        <span style={{ color: "rgba(255,255,255,0.4)" }}>Assembly {jamAssembly}j × Rp35.000</span>
                        <span style={{ color: "#a5b4fc" }}>Rp {(jamAssembly * 35000).toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {flatFinishingCost > 0 && (
                      <div className="flex justify-between">
                        <span style={{ color: "rgba(255,255,255,0.4)" }}>Consumables</span>
                        <span style={{ color: "#a5b4fc" }}>Rp {flatFinishingCost.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Total Finishing</span>
                      <span style={{ color: "#4ade80", fontWeight: 700 }}>
                        Rp {(
                          (jamSanding + jamAssembly) * 35000 +
                          jamPainting * 75000 +
                          flatFinishingCost
                        ).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Buttons row */}
        <div className="flex gap-2">
          {/* Print quote button — only when there are valid results */}
          {hasil && hasValidInput && (
            <button
              onClick={() => setShowPrint(true)}
              className="h-12 px-4 rounded-[12px] text-sm font-semibold transition-all flex-shrink-0 g-btn-ghost"
              title="Buat quote untuk customer"
            >
              🖨️
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={!hasValidInput || isSaving}
            className="flex-1 h-12 rounded-[12px] text-sm font-semibold text-white transition-all"
            style={{
              background:
                hasValidInput && !isSaving
                  ? "linear-gradient(135deg, #5055e8, #7c84f8)"
                  : "rgba(99,102,241,0.3)",
              boxShadow:
                hasValidInput && !isSaving
                  ? "0 4px 16px rgba(99,102,241,0.4)"
                  : "none",
              cursor:
                hasValidInput && !isSaving ? "pointer" : "not-allowed",
            }}
          >
            {isSaving ? "Menyimpan..." : isEditing ? "💾 Update Kalkulasi" : "Simpan Kalkulasi"}
          </button>
        </div>
      </div>

      {/* RIGHT: Results */}
      <div
        className="g-card rounded-[14px] p-4"
        style={{ border: "1px solid rgba(99,102,241,0.1)" }}
      >
        <div className="text-xs font-bold uppercase tracking-wider mb-4 g-accent">
          Hasil Kalkulasi
        </div>
        <HasilPanel
          hasil={hasil}
          hargaShopeeAktual={shopeeIsLocked ? linkedShopeePrice ?? undefined : hargaShopee}
          hargaOfflineAktual={hargaOffline && hargaOffline > 0 ? hargaOffline : undefined}
          isLoading={!ratesData}
          marginTier={marginTier}
        />
        {hasil && ratesData && (
          <RincianPanel
            plates={plates.filter(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0) && p.durasiJam > 0)}
            aksesori={{
              packingType: aksesori.packingType,
              gantunganType: aksesori.gantunganType,
              switchQty: aksesori.switchQty,
              hasLabel: aksesori.hasLabel,
              komponenKustom: aksesori.komponenKustom,
            }}
            batch={Math.max(1, batch)}
            rates={ratesData}
            hasil={hasil}
            hargaShopeeAktual={(shopeeIsLocked ? linkedShopeePrice : hargaShopee) ?? undefined}
            customRiskPct={customRiskEnabled ? customRiskPct : undefined}
            helmOptions={produktType === 'HELM' ? {
              finishType,
              jamSanding,
              jamPainting,
              jamAssembly,
              flatFinishingCost,
              preparerRatePerJam: ratesData.preparerRatePerJam,
              finisherRatePerJam: ratesData.finisherRatePerJam,
            } : undefined}
          />
        )}
      </div>

    </div>

    {/* Printable quote modal */}
    {showPrint && hasil && (
      <PrintableQuote
        nama={nama || "Kalkulasi"}
        batch={Math.max(1, batch)}
        plates={plates.filter(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0))}
        hasil={hasil}
        marginTier={marginTier}
        initialHargaShopee={shopeeIsLocked ? (linkedShopeePrice ?? undefined) : (hargaShopee && hargaShopee > 0 ? hargaShopee : undefined)}
        onClose={() => setShowPrint(false)}
      />
    )}
    </>
  )
}
