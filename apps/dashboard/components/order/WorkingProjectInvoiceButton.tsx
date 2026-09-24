"use client"

import Link from "next/link"
import { useState } from "react"
import { useCreateInvoice, useInvoiceList } from "@/lib/hooks/use-invoice"
import { useUpdateWorkingProject, type WorkingProject } from "@/lib/hooks/use-working-projects"
import type { QuotationInput } from "@/lib/invoice/types"

// Pre-fills a new invoice from the order. The order's `invoiceAmount` becomes
// one line item (the WP has no per-item breakdown); the user can refine it in
// the invoice editor afterwards.
export function buildInvoiceInput(wp: WorkingProject): QuotationInput {
  return {
    buyerNama: wp.customer,
    buyerContact: wp.contact,
    dueDate: wp.dueDate,
    shopeeOrderSn: wp.source === "shopee" ? wp.sourceOrderNo : null,
    catatan: wp.sourceOrderNo ? `Order ${wp.sourceOrderNo}` : null,
    items: [
      {
        namaProduk: wp.variant ? `${wp.product} (${wp.variant})` : wp.product,
        qty: 1,
        hargaPerUnit: wp.invoiceAmount,
        channelHarga: wp.platform && wp.platform.toLowerCase() !== "manual" ? "marketplace" : "offline",
      },
    ],
  }
}

// 🧾 button + create/link modal, used in each Working Project row. The link
// is stored on WorkingProject.quotationId (nullable, no FK).
export function WorkingProjectInvoiceButton({ wp }: { wp: WorkingProject }) {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState("")
  const [error, setError] = useState<string | null>(null)
  const { data: invoices } = useInvoiceList()
  const createInvoice = useCreateInvoice()
  const update = useUpdateWorkingProject()
  const busy = createInvoice.isPending || update.isPending
  const linked = wp.quotationId ? (invoices ?? []).find((i) => i.id === wp.quotationId) : undefined

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const createAndLink = () =>
    run(async () => {
      const created = await createInvoice.mutateAsync(buildInvoiceInput(wp))
      await update.mutateAsync({ id: wp.id, patch: { quotationId: created.id } })
    })
  const link = () => run(() => update.mutateAsync({ id: wp.id, patch: { quotationId: pick } }))
  const unlink = () => run(() => update.mutateAsync({ id: wp.id, patch: { quotationId: null } }))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`hover:opacity-80 text-base leading-none ${wp.quotationId ? "g-accent" : "opacity-60"}`}
        title={wp.quotationId ? "Invoice terhubung" : "Buat / tautkan invoice"}
        aria-label={`Invoice ${wp.sourceOrderNo ?? wp.customer}`}
      >
        🧾
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-[5px] p-5 max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--g-modal)", border: "1px solid var(--g-card-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold g-t1">Invoice — {wp.customer}</span>
              <button onClick={() => setOpen(false)} className="g-t4 text-lg leading-none" aria-label="Tutup">✕</button>
            </div>

            {wp.quotationId ? (
              <div className="space-y-3 text-sm">
                <p className="g-t2">
                  Terhubung ke invoice <b className="g-t1">{linked?.nomor ?? wp.quotationId}</b>
                  {linked ? ` (${linked.status})` : ""}.
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/invoice?open=${wp.quotationId}`}
                    className="flex-1 h-10 inline-flex items-center justify-center rounded-[5px] text-[13px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #5055e8, #818cf8)" }}
                  >
                    Buka Invoice
                  </Link>
                  <button onClick={unlink} disabled={busy} className="h-10 px-4 rounded-[5px] text-[13px] g-btn-ghost disabled:opacity-50">
                    Lepas Tautan
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="g-t4 text-xs mb-2">
                    Isi otomatis dari order ini (customer, produk, nominal Rp{wp.invoiceAmount.toLocaleString("id-ID")}).
                  </p>
                  <button
                    onClick={createAndLink}
                    disabled={busy}
                    className="w-full h-10 rounded-[5px] text-[13px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #5055e8, #818cf8)" }}
                  >
                    {busy ? "Memproses..." : "Buat Invoice Baru"}
                  </button>
                </div>
                <div>
                  <p className="g-t4 text-xs mb-2">Atau tautkan ke invoice yang sudah ada:</p>
                  <div className="flex gap-2">
                    <select
                      aria-label="Pilih invoice"
                      value={pick}
                      onChange={(e) => setPick(e.target.value)}
                      className="glass-input flex-1 h-10 rounded-[5px] px-2 text-sm"
                    >
                      <option value="">Pilih invoice…</option>
                      {(invoices ?? []).map((i) => (
                        <option key={i.id} value={i.id}>{i.nomor} — {i.buyerNama}</option>
                      ))}
                    </select>
                    <button onClick={link} disabled={busy || !pick} className="h-10 px-4 rounded-[5px] text-[13px] g-btn-ghost disabled:opacity-50">
                      Tautkan
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error ? <p role="alert" className="mt-3 text-xs text-red-500">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
