"use client"

import { useState, useRef, useEffect } from "react"
import { usePOList, useDeletePO, useOCRInvoice } from "@/lib/hooks/use-po"
import { POForm } from "./POForm"
import { PODetail } from "./PODetail"
import type { POListItem, OCRPOResult } from "@/lib/po/types"

const STATUS_CONFIG = {
  DRAFT:     { label: "Draft",    color: "var(--g-t2)", bg: "var(--g-inner)",    border: "var(--g-inner-border)" },
  ORDERED:   { label: "Ordered",  color: "#60a5fa",     bg: "rgba(96,165,250,0.1)",    border: "rgba(96,165,250,0.2)"   },
  RECEIVED:  { label: "Diterima", color: "#34d399",     bg: "rgba(52,211,153,0.1)",    border: "rgba(52,211,153,0.2)"   },
  CANCELLED: { label: "Batal",    color: "#f87171",     bg: "rgba(239,68,68,0.1)",     border: "rgba(239,68,68,0.2)"    },
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export function POTab() {
  const { data: items, isLoading } = usePOList()
  const deleteMut = useDeletePO()
  const ocrMut = useOCRInvoice()
  const fileRef = useRef<HTMLInputElement>(null)

  const [view, setView] = useState<"list" | "create" | "detail">("list")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ocrDraft, setOcrDraft] = useState<OCRPOResult | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)

  // JSON import state
  const [showJsonImport, setShowJsonImport] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)

  function handleJsonImport() {
    setJsonError(null)
    try {
      const parsed: OCRPOResult = JSON.parse(jsonText.trim())
      if (!parsed.items || !Array.isArray(parsed.items)) throw new Error("Field 'items' harus berupa array")
      setOcrDraft(parsed)
      setShowJsonImport(false)
      setJsonText("")
      setView("create")
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON tidak valid")
    }
  }

  // Clipboard paste → OCR
  useEffect(() => {
    if (view !== "list") return
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"))
      if (!item) return
      const file = item.getAsFile()
      if (file) { e.preventDefault(); handleOCR(file) }
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleOCR(file: File) {
    setOcrError(null)
    try {
      const result = await ocrMut.mutateAsync(file)
      setOcrDraft(result)
      setView("create")
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : "OCR gagal")
    }
  }

  if (view === "create") {
    return (
      <POForm
        ocrDraft={ocrDraft}
        onClose={() => { setView("list"); setOcrDraft(null) }}
        onSaved={(id) => { setSelectedId(id); setView("detail") }}
      />
    )
  }

  if (view === "detail" && selectedId) {
    return <PODetail poId={selectedId} onBack={() => { setSelectedId(null); setView("list") }} />
  }

  return (
    <div className="space-y-4">
      {/* Judul halaman diurus PageShell di halaman finance */}
      <div className="flex justify-end">
        <div className="flex gap-2 flex-wrap">
          {/* OCR Upload */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleOCR(f); e.target.value = "" }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={ocrMut.isPending}
            className="h-9 px-4 rounded-[5px] text-sm font-semibold transition-all g-btn-ghost"
            title="Upload file atau Ctrl+V untuk paste dari clipboard"
          >
            {ocrMut.isPending ? "⏳ Scanning..." : "📷 Scan"}
          </button>
          <button
            onClick={() => { setShowJsonImport(v => !v); setJsonError(null) }}
            className="h-9 px-4 rounded-[5px] text-sm font-semibold transition-all g-btn-ghost"
          >
            { } Import JSON
          </button>
          <button
            onClick={() => { setOcrDraft(null); setView("create") }}
            className="h-9 px-4 rounded-[5px] text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
          >
            + Buat PO
          </button>
        </div>
      </div>

      {/* JSON Import panel */}
      {showJsonImport && (
        <div className="g-card rounded-[5px] p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider g-accent">
            Import JSON dari Discord OCR
          </div>
          <div className="text-[10px] g-t4">
            Paste JSON yang sudah di-generate dari Discord bot — format sama dengan OCR response.
          </div>
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            placeholder={'{\n  "vendorNama": "xyz garage",\n  "tanggal": "2026-05-18",\n  "items": [...]\n}'}
            className="glass-input w-full rounded-[5px] px-3 py-2 text-xs font-mono"
            style={{ height: 160, resize: "vertical" }}
            autoFocus
          />
          {jsonError && (
            <div className="text-xs px-3 py-2 rounded-[5px]"
                 style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
              ⚠️ {jsonError}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setShowJsonImport(false); setJsonText(""); setJsonError(null) }}
                    className="g-btn-ghost flex-1 h-9 rounded-[5px] text-xs">Batal</button>
            <button onClick={handleJsonImport} disabled={!jsonText.trim()}
                    className="flex-1 h-9 rounded-[5px] text-xs font-semibold text-white"
                    style={{ background: jsonText.trim() ? "linear-gradient(135deg, #5055e8, #7c84f8)" : "var(--g-inner)",
                             color: jsonText.trim() ? "white" : "var(--g-t4)" }}>
              Import & Buka Form
            </button>
          </div>
        </div>
      )}

      {!ocrMut.isPending && !ocrError && !showJsonImport && (
        <div className="text-[10px] g-t5 text-right -mt-2">
          💡 Ctrl+V untuk paste screenshot invoice langsung
        </div>
      )}

      {ocrMut.isPending && (
        <div className="text-xs px-3 py-2 rounded-[5px] text-center"
             style={{ background: "rgba(99,102,241,0.08)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)" }}>
          ⏳ Scanning invoice... (Claude Vision bisa 30-60 detik)
        </div>
      )}

      {ocrError && (
        <div className="text-xs px-3 py-2 rounded-[5px]"
             style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
          ⚠️ {ocrError}
        </div>
      )}

      {isLoading && <div className="text-sm text-center py-12 g-t4">Memuat...</div>}

      {!isLoading && (items ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-[5px] gap-3 g-card"
             style={{ borderStyle: "dashed" }}>
          <div className="text-4xl">📋</div>
          <div className="text-sm g-t4">
            Belum ada PO. Upload foto invoice vendor atau buat manual.
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(items ?? []).map((po: POListItem) => {
          const cfg = STATUS_CONFIG[po.status] ?? STATUS_CONFIG.DRAFT
          return (
            <div key={po.id}
                 className="flex items-center gap-4 px-5 py-4 rounded-[5px] group cursor-pointer transition-all g-row"
                 onClick={() => { setSelectedId(po.id); setView("detail") }}>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold g-t1">
                    {po.nomor ?? `PO-${po.id.slice(-6).toUpperCase()}`}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                    {cfg.label}
                  </span>
                  {po.filamentItemCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)" }}>
                      🧵 {po.filamentItemCount} filamen
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5 g-t3">
                  {po.vendorNama} · {po.itemCount} item · {fmtDate(po.tanggal)}
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold g-t1">
                  {fmt(po.grandTotal)}
                </div>
              </div>

              <button
                onClick={e => { e.stopPropagation(); if (confirm(`Hapus PO?`)) deleteMut.mutate(po.id) }}
                className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-[5px] flex items-center justify-center text-xs transition-all"
                style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
              >✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
