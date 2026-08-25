"use client"

import { useState } from "react"

export function ModelForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/ring-resizer/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      setName("")
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass-card flex flex-wrap items-end gap-3 p-4">
      <label className="flex flex-col gap-1 text-xs g-t4">
        Nama model
        <input value={name} onChange={(e) => setName(e.target.value)} required
          className="glass-input rounded-lg px-3 py-2 text-sm" placeholder="Green Lantern 2026" />
      </label>
      <button type="submit" disabled={busy}
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Menyimpan…" : "Buat Model"}
      </button>
      <span className="text-xs g-t4">Base bore dihitung otomatis dari part band saat di-upload.</span>
      {error && <span className="text-xs g-t3">{error}</span>}
    </form>
  )
}
