'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useKomponenPresets, useUpsertKomponenPreset, useDeleteKomponenPreset } from '@/lib/hooks/use-kalkulator'

export function KomponenPresetsSection() {
  const qc = useQueryClient()
  const { data: presets, isLoading } = useKomponenPresets()
  const upsertMut = useUpsertKomponenPreset()
  const deleteMut = useDeleteKomponenPreset()
  const [nama, setNama] = useState('')
  const [harga, setHarga] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  function invalidatePresets() {
    qc.invalidateQueries({ queryKey: ['kalkulator', 'komponen-presets'] })
  }

  async function handleSubmit() {
    setError(null)
    const h = parseFloat(harga)
    if (!nama.trim() || !Number.isFinite(h) || h < 0) {
      setError('Isi nama dan harga (angka ≥ 0)')
      return
    }
    try {
      await upsertMut.mutateAsync({ nama: nama.trim(), harga: h })
      setNama(''); setHarga('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🧩 Komponen Preset</div>
      <p className="text-xs g-t4 mb-2">Biaya non-print siap pakai (gantungan, switch, label, magnet, …). Toggle nonaktif untuk menyembunyikan dari picker tanpa menghapus.</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(presets ?? []).map(k => (
          <div key={k.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)', opacity: k.isActive ? 1 : 0.5 }}>
            <span className="text-xs g-t2 flex-1">{k.nama}</span>
            <span className="text-xs font-mono g-t1">Rp {k.harga}</span>
            <button
              onClick={() => upsertMut.mutate({ nama: k.nama, harga: k.harga, isActive: !k.isActive }, {
                onError: e => { setRowError(e instanceof Error ? e.message : 'Gagal'); invalidatePresets() },
                onSuccess: () => setRowError(null),
              })}
              disabled={upsertMut.isPending}
              className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1 disabled:opacity-40"
              title={k.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
              {k.isActive ? '👁' : '🚫'}
            </button>
            <button onClick={() => { setNama(k.nama); setHarga(String(k.harga)) }}
              className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
            <button
              onClick={() => deleteMut.mutate(k.id, {
                onError: e => { setRowError(e instanceof Error ? e.message : 'Gagal'); invalidatePresets() },
                onSuccess: () => setRowError(null),
              })}
              disabled={deleteMut.isPending}
              className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1 disabled:opacity-40">✕</button>
          </div>
        ))}
        {(presets ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada preset.</div>
        )}
      </div>
      {rowError && <div className="text-xs text-red-400 mt-2">{rowError}</div>}

      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] g-t4 uppercase tracking-wide">Nama</label>
          <input value={nama} onChange={e => setNama(e.target.value)}
            placeholder="Magnet 8mm" className="glass-input text-xs px-2 py-1.5 rounded-md w-36" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] g-t4 uppercase tracking-wide">Harga (Rp)</label>
          <input type="number" min="0" value={harga} onChange={e => setHarga(e.target.value)}
            placeholder="500" className="glass-input text-xs px-2 py-1.5 rounded-md w-24" />
        </div>
        <button onClick={handleSubmit} disabled={upsertMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
          + Simpan
        </button>
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </div>
  )
}
