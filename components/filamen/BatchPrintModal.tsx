"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import type { SpoolData } from "@/lib/filamen/types"
import { SPOOL_STATUS_LABELS } from "@/lib/filamen/types"
import { connectPrinter, printStickerViaBluetooth, buildStickerEscPos } from "@/lib/filamen/bluetooth-printer"

interface BatchPrintModalProps {
  spools: SpoolData[]
  onClose: () => void
}

function StickerItem({ spool }: { spool: SpoolData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const label = `${spool.brand} ${spool.colorName}`
  const sub = `${spool.material} · #${spool.barcode.slice(0, 8).toUpperCase()} · ${SPOOL_STATUS_LABELS[spool.status]}`

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, spool.barcode, {
      width: 120, margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
  }, [spool.barcode])

  return (
    <div className="border border-gray-200 dark:border-slate-700 rounded p-2 text-center bg-white dark:bg-slate-800 w-[148px]">
      <canvas ref={canvasRef} className="mx-auto" />
      <div className="mt-1 text-xs font-semibold text-gray-800 dark:text-slate-100 leading-tight truncate">{label}</div>
      <div className="text-[10px] text-gray-500 dark:text-slate-400 leading-tight truncate">{sub}</div>
      <div className="mt-0.5 text-[10px] font-bold" style={{ color: spool.colorHex }}>
        ■ {spool.colorHex}
      </div>
    </div>
  )
}

export function BatchPrintModal({ spools, onClose }: BatchPrintModalProps) {
  const [btStatus, setBtStatus] = useState<"idle" | "connecting" | "printing" | "done" | "error">("idle")
  const [btProgress, setBtProgress] = useState(0)
  const [btError, setBtError] = useState("")

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  async function handleBluetooth() {
    if (!("bluetooth" in navigator)) {
      setBtError("Web Bluetooth tidak tersedia. Gunakan Chrome/Chromium.")
      setBtStatus("error")
      return
    }
    setBtStatus("connecting")
    setBtError("")
    try {
      const characteristic = await connectPrinter()
      setBtStatus("printing")
      for (let i = 0; i < spools.length; i++) {
        const s = spools[i]
        const label = `${s.brand} ${s.colorName}`
        const sub = `${s.material} · #${s.barcode.slice(0, 8).toUpperCase()} · ${SPOOL_STATUS_LABELS[s.status]}`
        const escData = buildStickerEscPos(s.barcode, label, sub)
        await printStickerViaBluetooth(characteristic, escData)
        setBtProgress(i + 1)
      }
      setBtStatus("done")
    } catch (e) {
      setBtError((e as Error).message)
      setBtStatus("error")
    }
  }

  return (
    <>
      {/* Hidden batch layout for system print */}
      <div id="print-batch" style={{ display: "none" }}>
        {spools.map((s) => (
          <div key={s.id} style={{ width: 148, pageBreakInside: "avoid" }}>
            <StickerItemPrint spool={s} />
          </div>
        ))}
      </div>

      {/* Modal UI */}
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl shadow-xl max-h-[85vh] flex flex-col" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-700 shrink-0">
            <h2 className="font-semibold text-gray-800 dark:text-slate-100">Print Batch — {spools.length} Stiker</h2>
            <button onClick={onClose} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">✕</button>
          </div>

          {/* Preview grid */}
          <div className="overflow-y-auto flex-1 p-4">
            <div className="flex flex-wrap gap-2">
              {spools.map((s) => (
                <StickerItem key={s.id} spool={s} />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="border-t dark:border-slate-700 p-4 space-y-2 shrink-0">
            <button
              onClick={handleBluetooth}
              disabled={btStatus === "connecting" || btStatus === "printing"}
              className="w-full bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm py-2 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700 disabled:opacity-50"
            >
              {btStatus === "idle" && `🖨️ Print ${spools.length} stiker via Bluetooth`}
              {btStatus === "connecting" && "Menghubungkan printer..."}
              {btStatus === "printing" && `Mencetak ${btProgress}/${spools.length}...`}
              {btStatus === "done" && `✅ Selesai — ${spools.length} stiker dicetak!`}
              {btStatus === "error" && "❌ Gagal — coba lagi"}
            </button>
            {btError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{btError}</p>}
            <button
              onClick={() => {
                // Make batch div visible for print, then restore
                const el = document.getElementById("print-batch")
                if (el) el.style.display = "flex"
                window.print()
                setTimeout(() => { if (el) el.style.display = "none" }, 500)
              }}
              className="w-full border border-gray-300 dark:border-slate-600 text-sm py-2 rounded-md text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              🖨️ Print via Dialog Sistem
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// Separate pure component for the hidden print layout (no canvas — uses img via data URL)
function StickerItemPrint({ spool }: { spool: SpoolData }) {
  const [dataUrl, setDataUrl] = useState("")
  const label = `${spool.brand} ${spool.colorName}`
  const sub = `${spool.material} · #${spool.barcode.slice(0, 8).toUpperCase()} · ${SPOOL_STATUS_LABELS[spool.status]}`

  useEffect(() => {
    QRCode.toDataURL(spool.barcode, { width: 120, margin: 1 }).then(setDataUrl)
  }, [spool.barcode])

  return (
    <div style={{ width: 148, padding: 6, textAlign: "center", fontFamily: "sans-serif", border: "1px solid #eee" }}>
      {dataUrl && <img src={dataUrl} alt={spool.barcode} style={{ width: 120, height: 120, margin: "0 auto" }} />}
      <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 9, color: "#666" }}>{sub}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: spool.colorHex }}>■ {spool.colorHex}</div>
    </div>
  )
}
