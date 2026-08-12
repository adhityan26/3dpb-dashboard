"use client"

import { useEffect, useRef, useState } from "react"

interface GopayConnectModalProps {
  onClose: () => void
  onConnected: () => void
}

export function GopayConnectModal({ onClose, onConnected }: GopayConnectModalProps) {
  const [output, setOutput] = useState("")
  const [status, setStatus] = useState<"idle" | "running" | "exited">("idle")
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const connectedCheckedRef = useRef(false)

  // Poll output/status selama proses login berjalan
  useEffect(() => {
    if (!started) return
    const poll = async () => {
      try {
        const res = await fetch("/api/gopay/output", { cache: "no-store" })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error ?? `HTTP ${res.status}`)
          return
        }
        const data = await res.json()
        setError(null)
        setOutput(data.output ?? "")
        setStatus(data.status ?? "idle")
      } catch {
        setError("Tidak bisa menghubungi login bridge")
      }
    }
    poll()
    const id = setInterval(poll, 1500)
    return () => clearInterval(id)
  }, [started])

  // Begitu proses CLI selesai, cek ground truth-nya di /token-status (bukan tebak-tebak dari teks output)
  useEffect(() => {
    if (status !== "exited" || connectedCheckedRef.current) return
    connectedCheckedRef.current = true
    setCheckingStatus(true)
    const checkStatus = async (attemptsLeft: number) => {
      try {
        const res = await fetch("/api/gopay/status", { cache: "no-store" })
        const data = await res.json()
        if (data?.connected) {
          setCheckingStatus(false)
          onConnected()
          return
        }
      } catch {
        // abaikan, coba lagi
      }
      if (attemptsLeft > 0) {
        setTimeout(() => checkStatus(attemptsLeft - 1), 2000)
      } else {
        setCheckingStatus(false)
      }
    }
    checkStatus(5)
  }, [status, onConnected])

  useEffect(() => {
    preRef.current?.scrollTo({ top: preRef.current.scrollHeight })
  }, [output])

  async function handleStart() {
    setError(null)
    const res = await fetch("/api/gopay/start", { method: "POST" })
    const data = await res.json()
    if (!res.ok) {
      setError(data.message ?? data.error ?? "Gagal memulai proses login")
      return
    }
    setStarted(true)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setError(null)
    const res = await fetch("/api/gopay/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.message ?? data.error ?? "Gagal mengirim input")
      return
    }
    setValue("")
  }

  async function handleCancel() {
    await fetch("/api/gopay/cancel", { method: "POST" }).catch(() => {})
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={handleCancel}
      role="dialog"
      aria-label="Hubungkan GoPay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold g-t1">💳 Hubungkan GoPay</h3>
          <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Tutup">
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-slate-400">
          Login OTP GoPay/GoBiz Merchant. Nomor HP dan kode OTP diproses langsung di server, tidak disimpan di halaman ini.
        </p>

        {!started ? (
          <button
            onClick={handleStart}
            className="w-full h-10 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
          >
            Mulai Login
          </button>
        ) : (
          <>
            <pre
              ref={preRef}
              className="bg-gray-900 text-gray-100 dark:bg-black rounded-lg p-4 text-xs h-56 overflow-auto whitespace-pre-wrap"
            >
              {output || "Menyiapkan proses login…"}
            </pre>

            <form onSubmit={handleSend} className="flex gap-2">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Nomor HP atau kode OTP, sesuai prompt di atas"
                className="flex-1 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm"
                autoFocus
                disabled={status !== "running"}
              />
              <button
                type="submit"
                disabled={status !== "running"}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Kirim
              </button>
            </form>

            {status === "exited" && (
              <div className="text-xs text-gray-500 dark:text-slate-400">
                {checkingStatus
                  ? "Proses login selesai, memeriksa status koneksi…"
                  : "Proses login selesai. Tutup jendela ini untuk melihat status koneksi terbaru."}
              </div>
            )}

            {status === "running" && (
              <button
                onClick={handleCancel}
                className="text-xs text-gray-500 dark:text-slate-400 underline hover:text-gray-700 dark:hover:text-slate-200"
              >
                Batalkan proses login
              </button>
            )}
          </>
        )}

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
