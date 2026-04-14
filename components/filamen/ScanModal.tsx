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

  useEffect(() => {
    if (mode !== "nfc") return

    const abort = new AbortController()
    nfcAbortRef.current = abort

    async function runNfc() {
      if (!("NDEFReader" in window)) {
        setStatus(
          location.protocol !== "https:"
            ? `NFC butuh HTTPS. Di Chrome Android: buka chrome://flags → cari "unsafely-treat-insecure-origin-as-secure" → tambah ${location.origin} → Relaunch.`
            : "Browser tidak support NFC. Gunakan Chrome di Android."
        )
        return
      }
      const ndef = new (window as unknown as { NDEFReader: new () => NDEFReader }).NDEFReader()
      setStatus("Dekatkan HP ke tag NFC...")
      try {
        await ndef.scan({ signal: abort.signal })
        ndef.addEventListener("reading", async (event: Event) => {
          const e = event as NDEFReadingEvent & { serialNumber?: string }

          // Immediate feedback
          setStatus("Tag terdeteksi, mencari...")

          // Try each record in order — support text, url, unknown/binary
          let value: string | null = null
          for (const record of e.message.records) {
            if (!record.data) continue
            try {
              const raw = new TextDecoder().decode(record.data as unknown as ArrayBuffer)
              if (raw.trim()) { value = raw.trim(); break }
            } catch { /* ignore */ }
          }

          // Fallback: use serialNumber (tag UID) — works for blank or proprietary tags
          if (!value) {
            value = e.serialNumber ?? null
          }

          if (!value) {
            setStatus("Tag terbaca tapi tidak ada data. Coba tulis tag NFC dulu.")
            return
          }

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

    runNfc()
    return () => { nfcAbortRef.current?.abort() }
  }, [mode, onFound, onNotFound])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-sm shadow-xl" role="dialog" aria-modal="true" aria-labelledby="scan-modal-title">
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-700">
          <h2 id="scan-modal-title" className="font-semibold text-gray-800 dark:text-slate-100">Scan Spool</h2>
          <button onClick={onClose} aria-label="Tutup" className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(["keyboard", "nfc", "camera"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setStatus("Siap scan") }}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${
                  mode === m
                    ? "bg-[#EE4D2D] dark:bg-indigo-600 text-white border-[#EE4D2D] dark:border-indigo-600"
                    : "bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600"
                }`}
              >
                {m === "keyboard" ? "⌨️ Scanner" : m === "nfc" ? "📡 NFC" : "📷 Kamera"}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="text-sm text-gray-600 dark:text-slate-300 text-center py-2">{status}</div>

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
                className="w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                autoFocus
              />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                Hardware scanner otomatis input + Enter. Bisa juga ketik manual.
              </p>
            </div>
          )}

          {/* NFC mode */}
          {mode === "nfc" && (
            <div className="text-center py-4">
              <div className="text-4xl mb-2">📡</div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Dekatkan HP ke tag NFC spool</p>
            </div>
          )}

          {/* Camera mode: placeholder */}
          {mode === "camera" && (
            <div className="text-center py-4 text-gray-400 dark:text-slate-500">
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
