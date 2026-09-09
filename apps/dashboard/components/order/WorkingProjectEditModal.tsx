"use client"

import { useState } from "react"
import type { WorkingProject } from "@/lib/hooks/use-working-projects"

export interface WorkingProjectEditPatch {
  customer?: string
  product?: string
  variant?: string
  dueDateRaw?: string
  paymentRaw?: string
  invoiceAmountRaw?: string
  shipping?: string
  trackingNo?: string
}

interface Props {
  project: WorkingProject | null
  onClose: () => void
  onSave: (vars: { id: string; patch: WorkingProjectEditPatch }) => void
  isPending: boolean
  error?: string | null
}

const fieldLabel = "text-[10px] font-semibold uppercase tracking-wider mb-1"

// Display value for the due-date input: `dueDateRaw` is only populated for
// legacy/unparseable text (parseDueDate nulls it out once a date is
// successfully parsed into `dueDate`), so a project with a parsed due date
// must fall back to formatting `dueDate` itself — otherwise the field opens
// blank and saving would send `dueDateRaw: ""`, silently wiping the due date.
function dueDateDisplayValue(project: WorkingProject): string {
  if (project.dueDateRaw) return project.dueDateRaw
  if (project.dueDate) return new Date(project.dueDate).toISOString().slice(0, 10)
  return ""
}

function initialValues(project: WorkingProject) {
  return {
    customer: project.customer,
    product: project.product,
    variant: project.variant ?? "",
    dueDateRaw: dueDateDisplayValue(project),
    paymentRaw: project.payment,
    invoiceAmountRaw: String(project.invoiceAmount),
    shipping: project.shipping ?? "",
    trackingNo: project.trackingNo ?? "",
  }
}

export function WorkingProjectEditModal({ project, onClose, onSave, isPending, error }: Props) {
  // Reset state via the "resetting state via key prop in state" React 19
  // pattern — mirrors WorkingProjectEditModal's siblings (HppEditModal etc.)
  // rather than useEffect.
  const [trackedId, setTrackedId] = useState<string | null>(project?.id ?? null)
  const [initial, setInitial] = useState(project ? initialValues(project) : null)
  const [customer, setCustomer] = useState(project?.customer ?? "")
  const [product, setProduct] = useState(project?.product ?? "")
  const [variant, setVariant] = useState(project?.variant ?? "")
  const [dueDateRaw, setDueDateRaw] = useState(project ? dueDateDisplayValue(project) : "")
  const [paymentRaw, setPaymentRaw] = useState(project?.payment ?? "")
  const [invoiceAmountRaw, setInvoiceAmountRaw] = useState(
    project ? String(project.invoiceAmount) : "",
  )
  const [shipping, setShipping] = useState(project?.shipping ?? "")
  const [trackingNo, setTrackingNo] = useState(project?.trackingNo ?? "")

  if (project && project.id !== trackedId) {
    setTrackedId(project.id)
    const values = initialValues(project)
    setInitial(values)
    setCustomer(values.customer)
    setProduct(values.product)
    setVariant(values.variant)
    setDueDateRaw(values.dueDateRaw)
    setPaymentRaw(values.paymentRaw)
    setInvoiceAmountRaw(values.invoiceAmountRaw)
    setShipping(values.shipping)
    setTrackingNo(values.trackingNo)
  }

  if (!project) return null

  function handleSave() {
    if (!project || !initial) return
    const current = { customer, product, variant, dueDateRaw, paymentRaw, invoiceAmountRaw, shipping, trackingNo }
    const patch: WorkingProjectEditPatch = {}
    let key: keyof typeof current
    for (key in current) {
      if (current[key] !== initial[key]) {
        patch[key] = current[key]
      }
    }
    onSave({ id: project.id, patch })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-[5px] p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold g-t1">Edit Order</span>
          <button onClick={onClose} className="g-t4 text-lg leading-none" aria-label="Tutup">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={`${fieldLabel} g-accent`}>Customer</label>
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
            />
          </div>
          <div>
            <label className={`${fieldLabel} g-accent`}>Produk</label>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
            />
          </div>
          <div>
            <label className={`${fieldLabel} g-accent`}>Variant</label>
            <input
              type="text"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
            />
          </div>
          <div>
            <label className={`${fieldLabel} g-accent`}>Due Date</label>
            <input
              type="text"
              placeholder="mis. 20 Sep 2026"
              value={dueDateRaw}
              onChange={(e) => setDueDateRaw(e.target.value)}
              className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
            />
          </div>
          <div>
            <label className={`${fieldLabel} g-accent`}>Payment</label>
            <input
              type="text"
              value={paymentRaw}
              onChange={(e) => setPaymentRaw(e.target.value)}
              className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
            />
          </div>
          <div>
            <label className={`${fieldLabel} g-accent`}>Nominal</label>
            <input
              type="text"
              inputMode="numeric"
              value={invoiceAmountRaw}
              onChange={(e) => setInvoiceAmountRaw(e.target.value)}
              className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
            />
          </div>
          <div>
            <label className={`${fieldLabel} g-accent`}>Shipping</label>
            <input
              type="text"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
            />
          </div>
          <div>
            <label className={`${fieldLabel} g-accent`}>No. Resi</label>
            <input
              type="text"
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-red-500">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 h-10 rounded-[5px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #5055e8, #818cf8)", color: "#fff" }}
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="h-10 px-4 rounded-[5px] text-[13px] g-btn-ghost"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  )
}
