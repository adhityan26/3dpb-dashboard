"use client"

import { useEffect, useState } from "react"
import {
  usePaymentMethods, useUpdatePaymentMethods,
  useInvoiceBankAccount, useUpdateInvoiceBankAccount,
  useInvoiceQris, useUpdateInvoiceQris,
} from "@/lib/hooks/use-invoice"

export function InvoiceMethodsCard() {
  const { data: methods, isLoading } = usePaymentMethods()
  const updateMut = useUpdatePaymentMethods()
  const { data: bankAccount } = useInvoiceBankAccount()
  const updateBankMut = useUpdateInvoiceBankAccount()
  const { data: qris } = useInvoiceQris()
  const updateQrisMut = useUpdateInvoiceQris()
  const [newMethod, setNewMethod] = useState("")
  const [bankDraft, setBankDraft] = useState("")
  const [bankSaved, setBankSaved] = useState(false)
  const [qrisSaved, setQrisSaved] = useState(false)
  const [qrisErr, setQrisErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (bankAccount !== undefined) setBankDraft(bankAccount)
  }, [bankAccount])

  async function handleSaveBank() {
    await updateBankMut.mutateAsync(bankDraft)
    setBankSaved(true)
    setTimeout(() => setBankSaved(false), 1500)
  }

  async function handleQrisFile(file: File) {
    setQrisErr(null)
    if (!file.type.startsWith("image/")) { setQrisErr("File harus berupa gambar"); return }
    if (file.size > 1_500_000) { setQrisErr("Gambar terlalu besar (maks 1.5MB)"); return }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    try {
      await updateQrisMut.mutateAsync(dataUrl)
      setQrisSaved(true)
      setTimeout(() => setQrisSaved(false), 1500)
    } catch (e) {
      setQrisErr(e instanceof Error ? e.message : "Gagal menyimpan QRIS")
    }
  }

  async function handleRemoveQris() {
    await updateQrisMut.mutateAsync("")
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

      {/* QRIS — shown on printed invoice */}
      <div className="pt-4 border-t" style={{ borderColor: "var(--g-border, rgba(255,255,255,0.08))" }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold g-t1">📱 QRIS</div>
            <div className="text-xs mt-0.5 g-t4">Upload gambar QRIS — ditampilkan di cetak invoice</div>
          </div>
          {qrisSaved && <span className="text-xs font-semibold" style={{ color: "#34d399" }}>✓ Tersimpan</span>}
        </div>

        {qris ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qris} alt="QRIS" className="w-24 h-24 rounded-[8px] object-contain" style={{ background: "#fff", padding: 4 }} />
            <div className="flex flex-col gap-2">
              <label className="h-8 px-3 rounded-[8px] text-xs font-semibold flex items-center cursor-pointer" style={{ background: "var(--g-inner)", color: "var(--g-t2)" }}>
                Ganti Gambar
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleQrisFile(f); e.target.value = "" }} />
              </label>
              <button onClick={handleRemoveQris} disabled={updateQrisMut.isPending}
                className="h-8 px-3 rounded-[8px] text-xs font-semibold" style={{ color: "#f87171", background: "rgba(248,113,113,0.1)" }}>
                Hapus
              </button>
            </div>
          </div>
        ) : (
          <label className="h-9 px-4 rounded-[8px] text-sm font-semibold inline-flex items-center cursor-pointer text-white" style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
            ⬆️ Upload QRIS
            <input type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleQrisFile(f); e.target.value = "" }} />
          </label>
        )}
        {qrisErr && <div className="text-xs mt-2" style={{ color: "#f87171" }}>{qrisErr}</div>}
      </div>
    </div>
  )
}
