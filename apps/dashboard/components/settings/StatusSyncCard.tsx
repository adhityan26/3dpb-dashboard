"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface StatusSyncResult {
  ranToday: boolean
  scanned?: number
  updated?: number
  skipped?: number
  failed?: number
  errors?: string[]
}

// The job itself runs automatically once a day (server poller, after 01:00
// WIB — see instrumentation.ts + lib/working-projects/status-sync.ts). This
// card is just visibility + a manual "run now" escape hatch (?force=1,
// ignores the daily cutoff/dedupe-by-date) for when you don't want to wait.
export function StatusSyncCard() {
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; result: StatusSyncResult }
  >({ status: "idle" })

  async function handleRunNow() {
    setState({ status: "loading" })
    try {
      const res = await fetch("/api/internal/working-projects/status-sync?force=1", { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as StatusSyncResult & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setState({ status: "done", result: json })
    } catch (err) {
      setState({ status: "error", message: (err as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🔄 Sync Status WP dengan Marketplace</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Tiap hari setelah jam 01:00 WIB, server otomatis mengecek WP berstatus Open dan
          menyamakan dengan status order asli di Shopee/Tokopedia: sudah dikirim kurir → Waiting
          Customer, sudah selesai → Done, dibatalkan → Canceled. Thread Discord ikut ter-update
          (bukan diarsipkan). &quot;Siap Kirim&quot; TIDAK pernah diset otomatis — itu penanda
          manual kamu sendiri kalau produksi sudah selesai, tidak ada hubungannya dengan status
          pengiriman marketplace.
        </p>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={state.status === "loading"} onClick={handleRunNow}>
            {state.status === "loading" ? "Menyinkronkan..." : "Jalankan Sekarang"}
          </Button>
          {state.status === "done" && (
            <span className="text-xs text-green-600">
              ✅ Dicek {state.result.scanned}, diupdate {state.result.updated}, sudah sesuai {state.result.skipped}
              {state.result.failed ? `, gagal ${state.result.failed}` : ""}
            </span>
          )}
          {state.status === "error" && <span className="text-xs text-red-500">❌ {state.message}</span>}
        </div>
        {state.status === "done" && state.result.errors && state.result.errors.length > 0 && (
          <ul className="text-xs text-red-500 list-disc pl-4">
            {state.result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
