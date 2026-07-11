'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMaterialProfiles, useUpsertMaterialProfile, useDeleteMaterialProfile } from '@/lib/hooks/use-kalkulator'

const EMPTY = { nama: '', tipe: 'FDM' as 'FDM' | 'SLA', hppPerGram: '', jualPerGram: '', failureRatePct: '12' }

export function MaterialProfilesSection() {
  const qc = useQueryClient()
  const { data: materials, isLoading } = useMaterialProfiles()
  const upsertMut = useUpsertMaterialProfile()
  const deleteMut = useDeleteMaterialProfile()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    const hpp = parseFloat(form.hppPerGram)
    const jual = parseFloat(form.jualPerGram)
    const fail = parseFloat(form.failureRatePct)
    if (!form.nama.trim() || !Number.isFinite(hpp) || !Number.isFinite(jual) || !Number.isFinite(fail)) {
      setError('Lengkapi nama, HPP/gram, Jual/gram, dan failure rate')
      return
    }
    try {
      await upsertMut.mutateAsync({ nama: form.nama.trim(), tipe: form.tipe, hppPerGram: hpp, jualPerGram: jual, failureRatePct: fail })
      setForm(EMPTY)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🧵 Material Profile</div>
      <p className="text-xs g-t4 mb-2">Harga default & failure rate per jenis material. Nama sama = update (upsert).</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(materials ?? []).map(m => (
          <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: m.tipe === 'SLA' ? 'rgba(244,114,182,0.2)' : 'rgba(99,102,241,0.2)', color: m.tipe === 'SLA' ? '#f9a8d4' : '#a5b4fc' }}>
              {m.tipe}
            </span>
            <span className="text-xs g-t2 flex-1">{m.nama}</span>
            <span className="text-xs font-mono g-t1">Rp {m.hppPerGram} → {m.jualPerGram}/g</span>
            <span className="text-[10px] g-t4">fail {m.failureRatePct}%</span>
            <button onClick={() => setForm({ nama: m.nama, tipe: m.tipe as 'FDM' | 'SLA', hppPerGram: String(m.hppPerGram), jualPerGram: String(m.jualPerGram), failureRatePct: String(m.failureRatePct) })}
              className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
            <button
              onClick={() => deleteMut.mutate(m.id, {
                onError: e => { setRowError(e instanceof Error ? e.message : 'Gagal'); qc.invalidateQueries({ queryKey: ['kalkulator', 'material-profiles'] }) },
                onSuccess: () => setRowError(null),
              })}
              disabled={deleteMut.isPending}
              className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1 disabled:opacity-40">✕</button>
          </div>
        ))}
        {(materials ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada material profile.</div>
        )}
      </div>
      {rowError && <div className="text-xs text-red-400 mt-2">{rowError}</div>}

      <div className="grid grid-cols-6 gap-2 items-end">
        <div className="col-span-2">
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Nama (PLA, PETG, …)</label>
          <input value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
            placeholder="PLA" className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Tipe</label>
          <select value={form.tipe} onChange={e => setForm(f => ({ ...f, tipe: e.target.value as 'FDM' | 'SLA' }))}
            className="glass-input w-full h-9 rounded-[8px] px-2 text-sm">
            <option value="FDM">FDM</option>
            <option value="SLA">SLA</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">HPP/g</label>
          <input type="number" min="0" value={form.hppPerGram} onChange={e => setForm(f => ({ ...f, hppPerGram: e.target.value }))}
            placeholder="300" className="glass-input w-full h-9 rounded-[8px] px-2 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Jual/g</label>
          <input type="number" min="0" value={form.jualPerGram} onChange={e => setForm(f => ({ ...f, jualPerGram: e.target.value }))}
            placeholder="900" className="glass-input w-full h-9 rounded-[8px] px-2 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Fail %</label>
          <input type="number" min="0" max="100" value={form.failureRatePct} onChange={e => setForm(f => ({ ...f, failureRatePct: e.target.value }))}
            className="glass-input w-full h-9 rounded-[8px] px-2 text-sm" />
        </div>
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      <button onClick={handleSubmit} disabled={upsertMut.isPending}
        className="mt-2 text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
        style={{ background: 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
        + Simpan material
      </button>
    </div>
  )
}
