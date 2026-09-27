"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface AutoCreateResult {
  ranToday: boolean
  scanned?: number
  created?: number
  skipped?: number
  failed?: number
  errors?: string[]
}

// The job itself runs automatically once a day (server poller, after 23:00
// WIB — see instrumentation.ts + lib/working-projects/auto-create.ts). This
// card is just visibility + a manual "run now" escape hatch (?force=1,
// ignores the daily cutoff/dedupe-by-date) for when you don't want to wait.
export function AutoCreateWorkingProjectsCard() {
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; result: AutoCreateResult }
  >({ status: "idle" })

  async function handleRunNow() {
    setState({ status: "loading" })
    try {
      const res = await fetch("/api/internal/working-projects/auto-create?force=1", { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as AutoCreateResult & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setState({ status: "done", result: json })
    } catch (err) {
      setState({ status: "error", message: (err as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🤖 Auto-Create Working Project</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Tiap hari setelah jam 23:00 WIB, server otomatis memindai order Shopee &amp; Tokopedia yang
          belum punya Working Project dan membuatkannya — sudah tidak perlu klik &quot;Buat Working
          Project&quot; satu-satu. Thread Discord-nya masuk ke forum sesuai kategori produk (lihat kartu
          Produk Cincin/Topeng/Clicker di bawah); yang tidak cocok kategori mana pun masuk ke forum umum.
        </p>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={state.status === "loading"} onClick={handleRunNow}>
            {state.status === "loading" ? "Memindai..." : "Jalankan Sekarang"}
          </Button>
          {state.status === "done" && (
            <span className="text-xs text-green-600">
              ✅ Dipindai {state.result.scanned}, dibuat {state.result.created}, sudah ada {state.result.skipped}
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
