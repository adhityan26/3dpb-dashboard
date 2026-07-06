"use client"

import { useState } from "react"
import { useTokopediaSession, useSaveTokopediaSession, useTestTokopediaSession } from "@/lib/hooks/use-tokopedia"

export function TokopediaSessionCard() {
  const { data: status } = useTokopediaSession()
  const saveMut = useSaveTokopediaSession()
  const testMut = useTestTokopediaSession()
  const [raw, setRaw] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  async function handleSave() {
    setMsg(null)
    let cookies: unknown
    try { cookies = JSON.parse(raw) } catch { setMsg("❌ JSON tidak valid"); return }
    if (!Array.isArray(cookies)) { setMsg("❌ Harus array dari EditThisCookies"); return }
    try {
      await saveMut.mutateAsync(cookies)
      setRaw("")
      setMsg("✅ Session tersimpan")
    } catch (e) { setMsg("❌ " + (e instanceof Error ? e.message : "gagal")) }
  }

  async function handleTest() {
    setMsg(null)
    const r = await testMut.mutateAsync()
    setMsg(r.ok ? "✅ Koneksi OK" : "❌ " + r.error)
  }

  const expired = status?.expired
  return (
    <div className="rounded-[16px] p-5 space-y-4 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🟢 Tokopedia Session</div>
        <div className="text-xs mt-0.5 g-t4">Paste cookies dari EditThisCookies (login seller-id.tokopedia.com dari jaringan server)</div>
      </div>

      {status?.exists ? (
        <div className="text-xs g-t2 space-y-1">
          <div>Seller ID: <span className="font-mono">{status.sellerId}</span></div>
          <div>Update: {status.updatedAt ? new Date(status.updatedAt).toLocaleString("id-ID") : "-"}</div>
          <div>Expiry token: {status.tokenExpiry ? new Date(status.tokenExpiry).toLocaleString("id-ID") : "-"}
            {" "}<span style={{ color: expired ? "#f87171" : "#34d399" }}>{expired ? "(expired)" : "(aktif)"}</span></div>
        </div>
      ) : <div className="text-xs g-t4">Belum ada session tersimpan.</div>}

      <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={4}
        placeholder='[{"name":"SELLER_TOKEN","value":"..."}, ...]'
        className="glass-input w-full rounded-[8px] px-3 py-2 text-xs font-mono" />

      <div className="flex gap-2 items-center">
        <button onClick={handleSave} disabled={!raw.trim() || saveMut.isPending}
          className="h-9 px-4 rounded-[8px] text-sm font-semibold text-white"
          style={{ background: raw.trim() ? "linear-gradient(135deg,#5055e8,#7c84f8)" : "var(--g-inner)" }}>
          Simpan
        </button>
        <button onClick={handleTest} disabled={!status?.exists || testMut.isPending}
          className="h-9 px-4 rounded-[8px] text-sm font-semibold" style={{ background: "var(--g-inner)", color: "var(--g-t2)" }}>
          {testMut.isPending ? "Menguji..." : "Test koneksi"}
        </button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  )
}
