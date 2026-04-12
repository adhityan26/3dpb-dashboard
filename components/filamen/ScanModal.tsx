"use client"

import { useState, useEffect, useRef } from "react"
import { scanLookup } from "@/lib/hooks/use-filamen"
import type { SpoolData } from "@/lib/filamen/types"

interface ScanModalProps {
  onFound: (spool: SpoolData) => void
  onNotFound: (rawValue: string, type: "nfc" | "barcode") => void
  onClose: () => void
}

export function ScanModal({ onFound, onNotFound, onClose }: ScanModalProps) {
  const [mode, setMode] = useState<"nfc" | "camera" | "keyboard">("keyboard")
  const [status, setStatus] = useState<string>("Siap scan")
  const [keyBuffer, setKeyBuffer] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const nfcAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (mode !== "keyboard") return
    inputRef.current?.focus()
  }, [mode])

  async function handleKeyboardScan(value: string) {
    if (!value.trim()) return
    setStatus("Mencari...")
    try {
      const result = await scanLookup("barcode", value.trim())
      if (result.found && result.spool) {
        onFound(result.spool)
      } else {
        onNotFound(value.trim(), "barcode")
      }
    } catch {
      setStatus("Error. Coba lagi.")
    }
  }

  async function startNfc() {
    if (!("NDEFReader" in window)) {
      setStatus("Browser tidak support NFC. Gunakan Android Chrome.")
      return
    }
    const ndef = new (window as unknown as { NDEFReader: new () => NDEFReader }).NDEFReader()
    const abort = new AbortController()
    nfcAbortRef.current = abort
    setStatus("Dekatkan HP ke tag NFC...")
    try {
      await ndef.scan({ signal: abort.signal })
      ndef.addEventListener("reading", async (event: Event) => {
        const nfcEvent = event as NDEFReadingEvent
        const record = nfcEvent.message.records[0]
        if (!record) return
        const decoder = new TextDecoder()
        const value = decoder.decode(record.data as unknown as ArrayBuffer)
        setStatus("Mencari...")
        try {
          const result = await scanLookup("nfc", value)
          if (result.found && result.spool) {
            onFound(result.spool)
          } else {
            onNotFound(value, "nfc")
          }
        } catch {
          setStatus("Error. Coba lagi.")
        }
      })
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setStatus("NFC error: " + (e as Error).message)
      }
    }
  }

  useEffect(() => {
    if (mode !== "nfc") return
    startNfc()
    return () => { nfcAbortRef.current?.abort() }
  }, [mode])

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose() }}
      tabIndex={-1}
    >
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" role="dialog" aria-modal="true" aria-labelledby="scan-modal-title">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 id="scan-modal-title" className="font-semibold text-gray-800">Scan Spool</h2>
          <button onClick={onClose} aria-label="Tutup" className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(["keyboard", "nfc", "camera"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${
                  mode === m
                    ? "bg-[#EE4D2D] text-white border-[#EE4D2D]"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {m === "keyboard" ? "⌨️ Scanner" : m === "nfc" ? "📡 NFC" : "📷 Kamera"}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="text-sm text-gray-600 text-center py-2">{status}</div>

          {/* Keyboard mode: captures hardware scanner or manual input */}
          {mode === "keyboard" && (
            <div>
              <input
                ref={inputRef}
                id="scan-keyboard-input"
                value={keyBuffer}
                onChange={(e) => setKeyBuffer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleKeyboardScan(keyBuffer)
                    setKeyBuffer("")
                  }
                }}
                placeholder="Arahkan scanner ke barcode, atau ketik manual + Enter"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">
                Hardware scanner otomatis input + Enter. Bisa juga ketik manual.
              </p>
            </div>
          )}

          {/* NFC mode */}
          {mode === "nfc" && (
            <div className="text-center py-4">
              <div className="text-4xl mb-2">📡</div>
              <p className="text-sm text-gray-500">Dekatkan HP ke tag NFC spool</p>
            </div>
          )}

          {/* Camera mode: placeholder */}
          {mode === "camera" && (
            <div className="text-center py-4 text-gray-400">
              <div className="text-4xl mb-2">📷</div>
              <p className="text-sm">Camera scan tersedia di update berikutnya.</p>
              <p className="text-xs mt-1">Gunakan hardware scanner atau NFC untuk sekarang.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
