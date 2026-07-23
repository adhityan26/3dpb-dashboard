'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLaborPresets, useUpsertLaborPreset, useDeleteLaborPreset } from '@/lib/hooks/use-kalkulator'
import type { LaborItem } from '@3pb/kalkulator-core'

interface ItemRow { nama: string; jam: string; ratePerJam: string; flat: string }
const EMPTY_ROW: ItemRow = { nama: '', jam: '', ratePerJam: '', flat: '' }

function rowToItem(r: ItemRow): LaborItem | null {
  const jam = parseFloat(r.jam)
  const rate = parseFloat(r.ratePerJam)
  const flat = parseFloat(r.flat)
  const hasJamRate = Number.isFinite(jam) && jam > 0 && Number.isFinite(rate) && rate > 0
  const hasFlat = Number.isFinite(flat) && flat > 0
  if (!r.nama.trim() || (!hasJamRate && !hasFlat)) return null
  return {
    nama: r.nama.trim(),
    ...(hasJamRate && { jam, ratePerJam: rate }),
    ...(hasFlat && { flat }),
  }
}

function itemCost(i: LaborItem): number {
  return (i.jam ?? 0) * (i.ratePerJam ?? 0) + (i.flat ?? 0)
}

export function LaborPresetsSection() {
  const qc = useQueryClient()
  const { data: presets, isLoading } = useLaborPresets()
  const upsertMut = useUpsertLaborPreset()
  const deleteMut = useDeleteLaborPreset()
  const [nama, setNama] = useState('')
  const [rows, setRows] = useState<ItemRow[]>([{ ...EMPTY_ROW }])
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  function setRow(i: number, patch: Partial<ItemRow>) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  async function handleSubmit() {
    setError(null)
    const items = rows.map(rowToItem)
    if (!nama.trim() || items.length === 0 || items.some(i => i === null)) {
      setError('Isi nama preset dan tiap baris: nama + (jam × rate) atau biaya flat')
      return
    }
    try {
      await upsertMut.mutateAsync({ nama: nama.trim(), items: items as LaborItem[] })
      setNama(''); setRows([{ ...EMPTY_ROW }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  function loadPreset(presetNama: string, items: LaborItem[]) {
    setNama(presetNama)
    setRows(items.map(i => ({
      nama: i.nama, jam: i.jam != null ? String(i.jam) : '',
      ratePerJam: i.ratePerJam != null ? String(i.ratePerJam) : '', flat: i.flat != null ? String(i.flat) : '',
    })))
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🛠️ Labor Preset</div>
      <p className="text-xs g-t4 mb-2">Paket biaya tenaga kerja (menggantikan mode Helm — preset Helm MINIMAL–HEAVY hasil migrasi ada di sini). Nama sama = update.</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(presets ?? []).map(p => (
          <div key={p.id} className="px-2 py-1.5 rounded-[5px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs g-t2 flex-1">{p.nama}</span>
              <span className="text-xs font-mono g-t1">Rp {Math.round(p.items.reduce((s, i) => s + itemCost(i), 0))}</span>
              <button onClick={() => loadPreset(p.nama, p.items)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
              <button
                onClick={() => deleteMut.mutate(p.id, {
                  onError: e => { setRowError(e instanceof Error ? e.message : 'Gagal'); qc.invalidateQueries({ queryKey: ['kalkulator', 'labor-presets'] }) },
                  onSuccess: () => setRowError(null),
                })}
                disabled={deleteMut.isPending}
                className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1 disabled:opacity-40">✕</button>
            </div>
            <div className="text-[10px] g-t5 mt-0.5">
              {p.items.map(i => i.jam != null ? `${i.nama} ${i.jam}j×${i.ratePerJam}` : `${i.nama} flat ${i.flat}`).join(' · ')}
            </div>
          </div>
        ))}
        {(presets ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada preset.</div>
        )}
      </div>
      {rowError && <div className="text-xs text-red-400 mt-2">{rowError}</div>}

      <div className="mb-2">
        <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Nama preset</label>
        <input value={nama} onChange={e => setNama(e.target.value)}
          placeholder="Helm CUSTOM" className="glass-input w-full h-9 rounded-[5px] px-3 text-sm" />
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-9 gap-1.5 items-center">
            <input value={r.nama} onChange={e => setRow(i, { nama: e.target.value })}
              placeholder="Sanding" className="glass-input col-span-3 h-8 rounded-[5px] px-2 text-xs" />
            <input type="number" min="0" step="0.25" value={r.jam} onChange={e => setRow(i, { jam: e.target.value })}
              placeholder="jam" className="glass-input col-span-1 h-8 rounded-[5px] px-2 text-xs" />
            <input type="number" min="0" value={r.ratePerJam} onChange={e => setRow(i, { ratePerJam: e.target.value })}
              placeholder="Rp/jam" className="glass-input col-span-2 h-8 rounded-[5px] px-2 text-xs" />
            <input type="number" min="0" value={r.flat} onChange={e => setRow(i, { flat: e.target.value })}
              placeholder="flat Rp" className="glass-input col-span-2 h-8 rounded-[5px] px-2 text-xs" />
            <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)}
              className="text-[10px] g-t4 hover:text-red-400 transition-colors col-span-1">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={() => setRows(rs => [...rs, { ...EMPTY_ROW }])}
          className="text-xs px-2.5 py-1 rounded-md g-t4 transition-colors"
          style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
          + baris
        </button>
        <button onClick={handleSubmit} disabled={upsertMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
          style={{ background: 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
          Simpan preset
        </button>
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </div>
  )
}
