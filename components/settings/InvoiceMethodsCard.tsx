"use client"

import { useEffect, useState } from "react"
import {
  usePaymentMethods, useUpdatePaymentMethods,
  useInvoiceBankAccount, useUpdateInvoiceBankAccount,
} from "@/lib/hooks/use-invoice"

export function InvoiceMethodsCard() {
  const { data: methods, isLoading } = usePaymentMethods()
  const updateMut = useUpdatePaymentMethods()
  const { data: bankAccount } = useInvoiceBankAccount()
  const updateBankMut = useUpdateInvoiceBankAccount()
  const [newMethod, setNewMethod] = useState("")
  const [bankDraft, setBankDraft] = useState("")
  const [bankSaved, setBankSaved] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (bankAccount !== undefined) setBankDraft(bankAccount)
  }, [bankAccount])

  async function handleSaveBank() {
    await updateBankMut.mutateAsync(bankDraft)
    setBankSaved(true)
    setTimeout(() => setBankSaved(false), 1500)
  }

  async function handleAdd() {
    const m = newMethod.trim()
    if (!m || (methods ?? []).includes(m)) { setNewMethod(""); return }
    const next = [...(methods ?? []), m]
    await updateMut.mutateAsync(next)
    setNewMethod("")
    flash()
  }

  async function handleRemove(m: string) {
    const next = (methods ?? []).filter(x => x !== m)
    await updateMut.mutateAsync(next)
    flash()
  }

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  if (isLoading) return <div className="text-sm text-center py-6 g-t4">Memuat...</div>

  return (
    <div className="rounded-[16px] p-5 space-y-4 g-card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold g-t1">💳 Metode Pembayaran Invoice</div>
          <div className="text-xs mt-0.5 g-t4">Pilihan metode yang muncul saat catat pembayaran</div>
        </div>
        {saved && (
          <span className="text-xs font-semibold" style={{ color: "#34d399" }}>✓ Tersimpan</span>
        )}
      </div>

      {/* Current methods */}
      <div className="flex flex-wrap gap-2">
        {(methods ?? []).map(m => (
          <div key={m}
               className="flex items-center gap-1.5 h-7 pl-3 pr-2 rounded-full text-xs font-medium"
               style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc" }}>
            {m}
            <button
              onClick={() => handleRemove(m)}
              disabled={updateMut.isPending}
              className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] transition-all"
              style={{ color: "rgba(165,180,252,0.6)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(165,180,252,0.6)")}
            >✕</button>
          </div>
        ))}
        {(methods ?? []).length === 0 && (
          <div className="text-xs g-t5">Belum ada metode — tambah di bawah</div>
        )}
      </div>

      {/* Add new */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newMethod}
          onChange={e => setNewMethod(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="Bank Jago, QRIS, Shopee..."
          className="glass-input flex-1 h-9 rounded-[8px] px-3 text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={!newMethod.trim() || updateMut.isPending}
          className="h-9 px-4 rounded-[8px] text-sm font-semibold text-white"
          style={{ background: newMethod.trim() ? "linear-gradient(135deg, #5055e8, #7c84f8)" : "var(--g-inner)", color: newMethod.trim() ? "white" : "var(--g-t4)" }}
        >
          + Tambah
        </button>
      </div>

      {/* Bank account — shown on printed invoice */}
      <div className="pt-4 border-t" style={{ borderColor: "var(--g-border, rgba(255,255,255,0.08))" }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold g-t1">🏦 Rekening Pembayaran</div>
            <div className="text-xs mt-0.5 g-t4">Ditampilkan di cetak invoice agar pelanggan bisa transfer</div>
          </div>
          {bankSaved && <span className="text-xs font-semibold" style={{ color: "#34d399" }}>✓ Tersimpan</span>}
        </div>
        <textarea
          value={bankDraft}
          onChange={e => setBankDraft(e.target.value)}
          rows={3}
          placeholder={"BCA 1234567890\na/n Nama Pemilik"}
          className="glass-input w-full rounded-[8px] px-3 py-2 text-sm"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSaveBank}
            disabled={bankDraft === (bankAccount ?? "") || updateBankMut.isPending}
            className="h-9 px-4 rounded-[8px] text-sm font-semibold"
            style={{
              background: bankDraft !== (bankAccount ?? "") ? "linear-gradient(135deg, #5055e8, #7c84f8)" : "var(--g-inner)",
              color: bankDraft !== (bankAccount ?? "") ? "white" : "var(--g-t4)",
            }}
          >
            Simpan Rekening
          </button>
        </div>
      </div>
    </div>
  )
}
