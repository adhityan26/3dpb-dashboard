'use client'

import { useEffect, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'

interface Status { latestVersion: string; deviceVersion: string | null; deviceIp: string | null; upToDate: boolean }

export default function FirmwareUpdatePage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  function refresh() {
    fetch('/api/firmware-update/status').then((r) => r.json()).then(setStatus)
  }

  useEffect(refresh, [])

  async function handleUpdate() {
    setBusy(true)
    setResult(null)
    const res = await fetch('/api/firmware-update/trigger', { method: 'POST' })
    const body = await res.json()
    setResult(body)
    setBusy(false)
    if (body.success) setTimeout(refresh, 3000)  // device reboot ~beberapa detik
  }

  if (!status) return <div className="p-6">Memuat status...</div>

  return (
    <PageShell title="Update Firmware CYD">
      <div className="max-w-lg">
        <div className="text-sm space-y-1 mb-4">
          <p>Versi ter-build: <code>{status.latestVersion}</code></p>
          <p>Versi di device: <code>{status.deviceVersion ?? 'tidak terdeteksi'}</code></p>
          <p>IP device: <code>{status.deviceIp ?? '-'}</code></p>
          <p>Status: {status.upToDate ? '✅ Sudah versi terbaru' : '⚠️ Ada update tersedia'}</p>
        </div>
        <button
          onClick={handleUpdate}
          disabled={busy || status.upToDate || !status.deviceIp}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {busy ? 'Mengupdate... (device restart otomatis)' : 'Update CYD'}
        </button>
        {result && (
          <p className={`mt-3 ${result.success ? 'text-green-600' : 'text-red-600'}`}>
            {result.success ? '✅ ' : '❌ '}{result.message}
          </p>
        )}
      </div>
    </PageShell>
  )
}
