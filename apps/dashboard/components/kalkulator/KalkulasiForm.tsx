"use client"

import { useState, useMemo } from "react"
import { PlateTable } from "./PlateTable"
import { KomponenSection } from "./KomponenSection"
import { LaborSection } from "./LaborSection"
import { HasilPanel } from "./HasilPanel"
import {
  useCreateKalkulasi, useUpdateKalkulasi, useKalkulatorRates,
  useSettingsV2, usePrinterProfiles, useMaterialProfiles,
} from "@/lib/hooks/use-kalkulator"
import { useKatalogList } from "@/lib/hooks/use-katalog"
import { useProducts } from "@/lib/hooks/use-products"
import type { KalkulasiData, KalkulasiInput, MarginTier, HasilKalkulasi, PackingType, PlateInputApp } from "@/lib/kalkulator/types"
import { buildHasilV2, type ResolveDeps } from "@/lib/kalkulator/resolve-v2"
import { composeKomponen, splitPackingRow, type KomponenRow, type LaborRow } from "@/lib/kalkulator/form-v2"
import { PrintableQuote } from "./PrintableQuote"
import { RincianPanel } from "./RincianPanel"

type PlateRow = PlateInputApp & { key: string }

const DEFAULT_PLATE: PlateRow = { key: "plate-init-1", tipe: "FDM", gramasi: 0, durasiJam: 0 }

function hasPlateContent(p: PlateInputApp): boolean {
  return (p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0
}

function toPlateInputApp(p: PlateRow): PlateInputApp {
  return {
    namaPart: p.namaPart,
    tipe: p.tipe,
    printer: p.printer,
    gramasi: p.gramasi ?? 0,
    materials: p.materials,
    durasiJam: p.durasiJam,
    filamentHargaId: p.filamentHargaId,
    hargaPerGram: p.hargaPerGram,
    printerProfileId: p.printerProfileId,
    materialProfileId: p.materialProfileId,
  }
}

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
  const { data: settingsV2 } = useSettingsV2()
  const { data: printerProfiles } = usePrinterProfiles()
  const { data: materialProfiles } = useMaterialProfiles()
  // Deps untuk jalur v2 — buildHasilV2/RincianPanel butuh keempatnya sudah ter-load.
  const deps: ResolveDeps | null = useMemo(() =>
    ratesData && settingsV2 && printerProfiles && materialProfiles
      ? { rates: ratesData, settings: settingsV2, printerProfiles, materialProfiles }
      : null,
    [ratesData, settingsV2, printerProfiles, materialProfiles])

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
      filamentHargaId: p.filamentHargaId ?? undefined,
      hargaPerGram: p.hargaPerGram ?? undefined,
      printerProfileId: p.printerProfileId ?? undefined,
      materialProfileId: p.materialProfileId ?? undefined,
    })) ?? [DEFAULT_PLATE]
  )
  const [customRiskEnabled, setCustomRiskEnabled] = useState(false)
  const [customRiskPct, setCustomRiskPct] = useState<number>(12)

  // Komponen (packing chip + baris preset/custom) & labor (baris generik) — bentuk v2.
  // Edit-reload: record lama menyimpan packing di kolom `packingType`; record yang
  // sudah dimigrasi/ditulis baru menyimpan sebagai baris "Packing X" di komponenKustom.
  const initSplit = initial
    ? splitPackingRow(initial.packingType ?? null, initial.komponenKustom)
    : { rows: [] as { nama: string; harga: number; qty: number }[] }
  const [packingType, setPackingType] = useState<PackingType | undefined>(initSplit.packingType)
  const [komponenRows, setKomponenRows] = useState<KomponenRow[]>(
    initSplit.rows.map((k, i) => ({ id: `kk-init-${i}`, nama: k.nama, harga: k.harga, qty: k.qty })))
  const [laborRows, setLaborRows] = useState<LaborRow[]>(
    (initial?.labor ?? []).map((l, i) => ({ id: `lb-init-${i}`, ...l })))

  // Dua varian plates: platesForSave (hanya filter ada isi — perilaku lama, durasi 0 boleh
  // masuk save) dan platesForCalc (tambahan filter durasi>0, dipakai preview/RincianPanel).
  const platesForSave = useMemo(() => plates.filter(hasPlateContent).map(toPlateInputApp), [plates])
  const platesForCalc = useMemo(() => platesForSave.filter(p => p.durasiJam > 0), [platesForSave])

  // Builder input v2 tunggal — dipakai preview (buildHasilV2), RincianPanel, dan save.
  const inputV2: KalkulasiInput = useMemo(() => ({
    nama: nama.trim() || "-",
    batch: Math.max(1, batch),
    marginTier,
    hargaShopeeAktual: (shopeeIsLocked ? linkedShopeePrice : hargaShopee) ?? undefined,
    hargaOfflineAktual: hargaOffline && hargaOffline > 0 ? hargaOffline : undefined,
    // legacy wajib (masih required di type sampai Task 10) — nol semua:
    switchQty: 0, hasLabel: false, komponenKustom: [],
    plates: platesForCalc,
    komponen: composeKomponen(packingType, ratesData?.packing ?? {}, komponenRows),
    labor: laborRows.filter(l => l.nama.trim() && ((l.jam ?? 0) * (l.ratePerJam ?? 0) > 0 || (l.flat ?? 0) > 0))
                    .map(l => ({ nama: l.nama.trim(), jam: l.jam, ratePerJam: l.ratePerJam, flat: l.flat })),
    customRiskPct: customRiskEnabled ? customRiskPct : undefined,
  }), [nama, batch, marginTier, hargaShopee, shopeeIsLocked, linkedShopeePrice, hargaOffline,
       platesForCalc, packingType, komponenRows, laborRows, ratesData, customRiskEnabled, customRiskPct])

  // Input jalur v2 dipakai preview & RincianPanel — plates dibatasi ke yang punya durasi
  // (platesForCalc); inputV2.plates sudah sama, tapi disatukan lewat memo agar buildHasilV2
  // dan RincianPanel memakai referensi objek yang identik.
  const calcInput = useMemo(() => ({ ...inputV2, plates: platesForCalc }), [inputV2, platesForCalc])

  // Preview real-time — jalur v2 PERSIS (identik server: resolveInputV2 + hitungKalkulasiV2).
  const computed = useMemo(() => {
    if (!deps) return null
    if (calcInput.plates.length === 0 && !calcInput.komponen?.some(k => k.harga > 0)) return null
    try { return buildHasilV2(calcInput, deps) } catch { return null }
  }, [deps, calcInput])
  const hasil: HasilKalkulasi | null = computed

  // Round up to nearest 5000 for placeholder suggestions
  function roundUp5000(n: number): number {
    return Math.ceil(n / 5000) * 5000
  }
  const placeholderShopee = hasil ? `Rp ${roundUp5000(hasil.shopeeA).toLocaleString("id-ID")}` : "Rp 35.000"
  const placeholderOffline = hasil ? `Rp ${roundUp5000(hasil.offlineA).toLocaleString("id-ID")}` : "Rp 30.000"

  const isEditing = !!initial

  async function handleSave() {
    if (!nama.trim() || (platesForSave.length === 0 && !inputV2.komponen?.some(k => k.harga > 0))) return
    const input: KalkulasiInput = { ...inputV2, plates: platesForSave, nama: nama.trim() }

    let saved: KalkulasiData
    if (isEditing && initial) {
      saved = await updateMut.mutateAsync({ id: initial.id, input })
    } else {
      saved = await createMut.mutateAsync(input)
    }
    onSaved?.(saved)
  }

  const isSaving = createMut.isPending || updateMut.isPending
  // Gate save ke ratesData: sebelum rates ter-load, composeKomponen menghargai packing
  // dengan packingRates kosong (harga 0) — save di jendela itu bisa mem-persist harga
  // understated. Preview/RincianPanel sudah ter-gate lewat `deps`.
  const hasValidInput = !!ratesData && nama.trim().length > 0 &&
    (platesForSave.length > 0 || !!inputV2.komponen?.some(k => k.harga > 0))
  const [showPrint, setShowPrint] = useState(false)

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

        {/* Komponen (packing + preset/custom) & Labor */}
        <KomponenSection
          packingType={packingType}
          onPackingChange={setPackingType}
          rows={komponenRows}
          onRowsChange={setKomponenRows}
          packingRates={ratesData?.packing ?? { S: 1500, M: 2500, L: 5000, XL: 8000 }}
        />
        <LaborSection rows={laborRows} onRowsChange={setLaborRows} />

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
        {hasil && deps && (
          <RincianPanel
            input={calcInput}
            deps={deps}
            hasil={hasil}
            hargaShopeeAktual={(shopeeIsLocked ? linkedShopeePrice : hargaShopee) ?? undefined}
          />
        )}
      </div>

    </div>

    {/* Printable quote modal */}
    {showPrint && hasil && (
      <PrintableQuote
        nama={nama || "Kalkulasi"}
        batch={Math.max(1, batch)}
        plates={plates.filter(hasPlateContent)}
        hasil={hasil}
        marginTier={marginTier}
        initialHargaShopee={shopeeIsLocked ? (linkedShopeePrice ?? undefined) : (hargaShopee && hargaShopee > 0 ? hargaShopee : undefined)}
        onClose={() => setShowPrint(false)}
      />
    )}
    </>
  )
}
