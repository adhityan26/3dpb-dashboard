"use client"

import { useState, useEffect, useRef } from "react"
import QRCode from "qrcode"
import type { SpoolData } from "@/lib/filamen/types"
import { SPOOL_STATUS_LABELS } from "@/lib/filamen/types"
import { connectPrinter, printStickerViaBluetooth, buildStickerEscPos } from "@/lib/filamen/bluetooth-printer"

interface PrintModalProps {
  spool: SpoolData
  onClose: () => void
}

export function PrintModal({ spool, onClose }: PrintModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [btStatus, setBtStatus] = useState<"idle" | "connecting" | "printing" | "done" | "error">("idle")
  const [btError, setBtError] = useState("")

  const spoolLabel = `${spool.brand} ${spool.colorName}`
  const subLabel = `${spool.material} · #${spool.barcode.slice(0, 8).toUpperCase()} · ${SPOOL_STATUS_LABELS[spool.status]}`

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, spool.barcode, {
      width: 150,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
  }, [spool.barcode])

  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, []) // stable — subscribes once

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
      const escData = buildStickerEscPos(spool.barcode, spoolLabel, subLabel)
      await printStickerViaBluetooth(characteristic, escData)
      setBtStatus("done")
    } catch (e) {
      setBtError((e as Error).message)
      setBtStatus("error")
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" role="dialog" aria-modal="true" aria-labelledby="print-modal-title">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 id="print-modal-title" className="font-semibold text-gray-800">Print Stiker Spool</h2>
          <button onClick={onClose} aria-label="Tutup" className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* QR preview */}
          <div className="border border-gray-200 rounded-lg p-4 text-center bg-white" id="print-stiker">
            <canvas ref={canvasRef} className="mx-auto" />
            <div className="mt-2 text-sm font-semibold text-gray-800">{spoolLabel}</div>
            <div className="text-xs text-gray-500">{subLabel}</div>
            <div className="mt-1 text-xs font-bold" style={{ color: spool.colorHex }}>
              ■ {spool.colorHex}
            </div>
          </div>

          {/* Bluetooth print */}
          <button
            onClick={handleBluetooth}
            disabled={btStatus === "connecting" || btStatus === "printing"}
            className="w-full bg-[#EE4D2D] text-white text-sm py-2 rounded-md hover:bg-[#d44226] disabled:opacity-50"
          >
            {btStatus === "idle" && "🖨️ Print via Bluetooth Thermal"}
            {btStatus === "connecting" && "Menghubungkan printer..."}
            {btStatus === "printing" && "Mencetak..."}
            {btStatus === "done" && "✅ Berhasil dicetak!"}
            {btStatus === "error" && "❌ Gagal — coba lagi"}
          </button>

          {btError && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{btError}</p>
          )}

          {/* Fallback: system print */}
          <button
            onClick={() => window.print()}
            className="w-full border border-gray-300 text-sm py-2 rounded-md text-gray-600 hover:bg-gray-50"
          >
            🖨️ Print via Dialog Sistem (fallback)
          </button>
        </div>
      </div>
    </div>
  )
}
