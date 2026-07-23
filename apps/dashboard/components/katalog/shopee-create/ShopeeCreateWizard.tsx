"use client"

import { useState } from "react"
import { X } from "lucide-react"
import type { ProdukInternalData } from "@/lib/katalog/types"
import type { AttributeValue } from "./AttributeFields"
import { StepInfo } from "./StepInfo"
import { StepMedia } from "./StepMedia"
import { StepPricing } from "./StepPricing"
import { StepShipping } from "./StepShipping"
import { StepVariants } from "./StepVariants"

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5
  // Step 1
  itemName: string
  description: string
  categoryId: number | null
  categoryPath: Array<{ id: number; name: string }>
  condition: "NEW" | "USED"
  attributeValues: Record<number, AttributeValue>
  // Step 2
  images: Array<{ imageId: string; imageUrl: string }>
  // Step 3
  price: number
  stock: number
  // Step 4
  weight: number
  packageLength: number
  packageWidth: number
  packageHeight: number
  selectedLogistics: number[]
  variantsEnabled: boolean
  // Step 5
  tierVariationName: string
  tierVariationOptions: string[]
  models: Array<{ optionIndex: number; price: number; stock: number }>
}

interface Props {
  katalog: ProdukInternalData
  onClose: () => void
  onSuccess: (itemId: number, editUrl: string) => void
}

const STEP_LABELS = ["Info", "Media", "Harga", "Kirim", "Variasi"]

export function ShopeeCreateWizard({ katalog, onClose, onSuccess }: Props) {
  const [state, setState] = useState<WizardState>({
    step: 1,
    itemName: katalog.nama,
    description: katalog.deskripsi ?? "",
    categoryId: null,
    categoryPath: [],
    condition: "NEW",
    attributeValues: {},
    images: [],
    price: katalog.shopeeA ?? 0,
    stock: 1,
    weight: 0,
    packageLength: 0,
    packageWidth: 0,
    packageHeight: 0,
    selectedLogistics: [],
    variantsEnabled: false,
    tierVariationName: "",
    tierVariationOptions: [],
    models: [],
  })

  function update(patch: Partial<WizardState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  const maxStep = state.variantsEnabled ? 5 : 4
  const stepLabels = state.variantsEnabled ? STEP_LABELS : STEP_LABELS.slice(0, 4)

  function goNext() {
    if (state.step < maxStep) update({ step: (state.step + 1) as WizardState["step"] })
  }

  function goPrev() {
    if (state.step > 1) update({ step: (state.step - 1) as WizardState["step"] })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-[5px] overflow-hidden"
        style={{ background: "rgba(14,14,44,0.99)", border: "1px solid rgba(99,102,241,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div>
            <div className="text-[14px] font-bold text-white">🛒 Buat Produk di Shopee</div>
            <div className="text-[11px] mt-0.5 truncate max-w-xs" style={{ color: "rgba(165,180,252,0.5)" }}>
              {katalog.nama}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
            style={{ color: "rgba(255,255,255,0.35)" }}
            aria-label="Tutup wizard"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {stepLabels.map((label, i) => {
            const stepNum = i + 1
            const isActive = state.step === stepNum
            const isDone = state.step > stepNum
            return (
              <div key={stepNum} className="flex items-center gap-2">
                {i > 0 && <div className="flex-1 h-px w-6" style={{ background: isDone ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)" }} />}
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                    style={{
                      background: isActive ? "rgba(99,102,241,0.8)" : isDone ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.08)",
                      color: isActive ? "white" : isDone ? "#a5b4fc" : "rgba(255,255,255,0.3)",
                      border: stepNum === 5 ? "1px dashed rgba(99,102,241,0.3)" : "none",
                    }}
                  >
                    {isDone ? "✓" : stepNum}
                  </div>
                  <span className="text-[10px] hidden sm:block" style={{ color: isActive ? "#a5b4fc" : "rgba(255,255,255,0.3)" }}>
                    {label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state.step === 1 && <StepInfo state={state} update={update} />}
          {state.step === 2 && <StepMedia state={state} update={update} katalogImageUrl={katalog.imageUrl} />}
          {state.step === 3 && <StepPricing state={state} update={update} />}
          {state.step === 4 && <StepShipping state={state} update={update} />}
          {state.step === 5 && <StepVariants state={state} update={update} />}
        </div>

        {/* Navigation */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={state.step === 1 ? onClose : goPrev}
            className="text-[12px] px-4 py-2 rounded-[5px] transition-opacity hover:opacity-70"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            {state.step === 1 ? "Batal" : "← Kembali"}
          </button>

          {state.step < maxStep ? (
            <button
              onClick={goNext}
              className="text-[12px] font-semibold px-4 py-2 rounded-[5px] transition-opacity hover:opacity-80"
              style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}
            >
              Lanjut →
            </button>
          ) : (
            <SubmitButton state={state} katalogId={katalog.id} onSuccess={onSuccess} />
          )}
        </div>
      </div>
    </div>
  )
}

function SubmitButton({ state, katalogId, onSuccess }: {
  state: WizardState
  katalogId: string
  onSuccess: (itemId: number, editUrl: string) => void
}) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setIsPending(true)
    setError(null)
    try {
      const hasVariants = state.variantsEnabled && state.tierVariationOptions.length >= 2

      const body = {
        katalogId,
        itemName: state.itemName,
        description: state.description,
        categoryId: state.categoryId!,
        condition: state.condition,
        imageIds: state.images.map(i => i.imageId),
        weight: state.weight,
        ...(state.packageLength && state.packageWidth && state.packageHeight ? {
          packageLength: state.packageLength,
          packageWidth: state.packageWidth,
          packageHeight: state.packageHeight,
        } : {}),
        logistics: state.selectedLogistics.map(id => ({ logistic_id: id, enabled: true, is_free: false })),
        attributes: Object.entries(state.attributeValues)
          .filter(([, v]) => v.value_id != null || v.value_text?.trim())
          .map(([id, v]) => ({ attribute_id: Number(id), ...v })),
        ...(hasVariants ? {
          tierVariation: { name: state.tierVariationName, options: state.tierVariationOptions },
          models: state.models,
        } : {
          price: state.price,
          stock: state.stock,
        }),
      }

      const res = await fetch("/api/shopee/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onSuccess(json.item_id, json.shopeeEditUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat produk")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <div className="text-[10px] px-3 py-1 rounded-[5px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
          ❌ {error}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="text-[12px] font-semibold px-4 py-2 rounded-[5px] transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.5), rgba(124,132,248,0.5))", color: "#a5b4fc" }}
      >
        {isPending ? "Membuat..." : "🛒 Buat Produk di Shopee"}
      </button>
    </div>
  )
}
