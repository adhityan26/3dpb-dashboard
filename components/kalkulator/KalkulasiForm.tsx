"use client"

import { useState, useMemo } from "react"
import { PlateTable } from "./PlateTable"
import { AksesoriSection } from "./AksesoriSection"
import { HasilPanel } from "./HasilPanel"
import { hitungKalkulasi } from "@/lib/kalkulator/formula"
import { useCreateKalkulasi, useUpdateKalkulasi, useKalkulatorRates } from "@/lib/hooks/use-kalkulator"
import { useKatalogList } from "@/lib/hooks/use-katalog"
import { useProducts } from "@/lib/hooks/use-products"
import type { KalkulasiData, KalkulasiInput, MarginTier, HasilKalkulasi } from "@/lib/kalkulator/types"
import type { AksesoriState } from "./AksesoriSection"
import { PrintableQuote } from "./PrintableQuote"

interface PlateRow {
  key: string
  namaPart?: string
  tipe: "FDM" | "SLA"
  printer?: string
  gramasi: number
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
  const [plates, setPlates] = useState<PlateRow[]>(
    initial?.plates.map(p => ({
      key: `p-${p.id}`,
      namaPart: p.namaPart ?? undefined,
      tipe: p.tipe as "FDM" | "SLA",
      printer: p.printer ?? undefined,
      gramasi: p.gramasi,
      durasiJam: p.durasiJam,
    })) ?? [DEFAULT_PLATE]
  )
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
    const validPlates = plates.filter(p => p.gramasi > 0 && p.durasiJam > 0)
    if (validPlates.length === 0) return null
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
        marginTier,
        // Use actual Shopee price from linked product if available, otherwise manual input
        (shopeeIsLocked ? linkedShopeePrice : hargaShopee) ?? undefined
      )
    } catch { return null }
  }, [plates, aksesori, batch, marginTier, hargaShopee, shopeeIsLocked, linkedShopeePrice, ratesData])

  const isEditing = !!initial

  async function handleSave() {
    if (!nama.trim() || plates.filter(p => p.gramasi > 0).length === 0) return
    const input: KalkulasiInput = {
      nama: nama.trim(),
      batch: Math.max(1, batch),
      marginTier,
      hargaShopeeAktual: hargaShopee && hargaShopee > 0 ? hargaShopee : undefined,
      packingType: aksesori.packingType,
      gantunganType: aksesori.gantunganType,
      switchQty: aksesori.switchQty,
      hasLabel: aksesori.hasLabel,
      plates: plates.filter(p => p.gramasi > 0).map(p => ({
        namaPart: p.namaPart,
        tipe: p.tipe,
        printer: p.printer,
        gramasi: p.gramasi,
        durasiJam: p.durasiJam,
      })),
      komponenKustom: aksesori.komponenKustom
        .filter(k => k.nama && k.harga > 0)
        .map(k => ({
          nama: k.nama,
          harga: k.harga,
          qty: k.qty,
        })),
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
  const hasValidInput = nama.trim().length > 0 && plates.some(p => p.gramasi > 0)
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
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "rgba(165,180,252,0.6)" }}
            >
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
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "rgba(165,180,252,0.6)" }}
              >
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
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "rgba(165,180,252,0.6)" }}
              >
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
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "rgba(255,255,255,0.4)",
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
          <div
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "rgba(165,180,252,0.6)" }}
          >
            Part / Plate
          </div>
          <PlateTable plates={plates} onChange={setPlates} />
        </div>

        {/* Aksesori */}
        <AksesoriSection value={aksesori} onChange={setAksesori} rates={aksesoriRates} />

        {/* Harga Shopee */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "rgba(165,180,252,0.6)" }}
            >
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
              <span className="text-[10px] font-normal" style={{ color: "rgba(255,255,255,0.25)" }}>
                (opsional)
              </span>
            )}
          </div>
          <input
            type="text"
            placeholder="Rp 35.000"
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

        {/* Buttons row */}
        <div className="flex gap-2">
          {/* Print quote button — only when there are valid results */}
          {hasil && hasValidInput && (
            <button
              onClick={() => setShowPrint(true)}
              className="h-12 px-4 rounded-[12px] text-sm font-semibold transition-all flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.7)",
              }}
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
        className="rounded-[14px] p-4"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(99,102,241,0.1)",
        }}
      >
        <div
          className="text-xs font-bold uppercase tracking-wider mb-4"
          style={{ color: "rgba(165,180,252,0.6)" }}
        >
          Hasil Kalkulasi
        </div>
        <HasilPanel
          hasil={hasil}
          hargaShopeeAktual={shopeeIsLocked ? linkedShopeePrice ?? undefined : hargaShopee}
          isLoading={!ratesData}
          marginTier={marginTier}
        />
      </div>

    </div>

    {/* Printable quote modal */}
    {showPrint && hasil && (
      <PrintableQuote
        nama={nama || "Kalkulasi"}
        batch={Math.max(1, batch)}
        plates={plates.filter(p => p.gramasi > 0)}
        hasil={hasil}
        marginTier={marginTier}
        onClose={() => setShowPrint(false)}
      />
    )}
    </>
  )
}
