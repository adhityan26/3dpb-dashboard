'use client'

import { useEffect, useState } from 'react'
import { RACK_SLOTS, GANYMEDE_SLOT } from '@/lib/cyd-layout/rack-template'

interface PrinterOption { id: string; name: string }

export default function CydLayoutPage() {
  const [printers, setPrinters] = useState<PrinterOption[]>([])
  const [assignment, setAssignment] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'confirmed' | 'timeout' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/cyd-layout/printers')
      .then((r) => r.json())
      .then((data: PrinterOption[]) => setPrinters(data))
      .catch(() => setStatus('error'))
  }, [])

  const allSlots = [...RACK_SLOTS, GANYMEDE_SLOT]

  async function handleSave() {
    setStatus('saving')
    try {
      const res = await fetch('/api/cyd-layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignment }),
      })
      const body = await res.json()
      setStatus(body.confirmed ? 'confirmed' : 'timeout')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Layout CYD — Rak Printer</h1>
      <p className="text-sm text-gray-500 mb-6">
        Pilih printer per slot rak. Halaman detail (auto-rotate) di-generate otomatis dari urutan ini.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {allSlots.map((slot) => (
          <div key={slot.key}>
            <label className="block text-sm font-medium mb-1">{slot.label}</label>
            <select
              className="w-full border rounded px-2 py-1"
              value={assignment[slot.key] ?? ''}
              onChange={(e) => setAssignment((a) => ({ ...a, [slot.key]: e.target.value }))}
            >
              <option value="">— kosong —</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={status === 'saving'}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {status === 'saving' ? 'Menyimpan...' : 'Simpan'}
      </button>
      {status === 'confirmed' && <p className="mt-3 text-green-600">✅ Diterapkan ke CYD</p>}
      {status === 'timeout' && <p className="mt-3 text-amber-600">⚠️ Tersimpan, tapi device belum konfirmasi (cek koneksi CYD)</p>}
      {status === 'error' && <p className="mt-3 text-red-600">Gagal menyimpan, coba lagi.</p>}
    </div>
  )
}
