'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCydFieldPresets, useCreateCydFieldPreset, useUpdateCydFieldPreset, useDeleteCydFieldPreset,
} from '@/lib/hooks/use-cyd-field-presets'
import { LAYOUT_LIMITS, type FieldId, type FieldRow } from '@/lib/cyd-layout/types'

const FIELD_ID_OPTIONS: { value: FieldId; label: string }[] = [
  { value: 'name', label: 'Nama printer' },
  { value: 'type', label: 'Tipe' },
  { value: 'state', label: 'Status' },
  { value: 'progress', label: 'Progress %' },
  { value: 'progressBar', label: 'Progress bar' },
  { value: 'timeLeft', label: 'Sisa waktu' },
  { value: 'eta', label: 'ETA' },
  { value: 'filename', label: 'Nama file' },
  { value: 'error', label: 'Error' },
]

interface BuilderField { id: FieldId; label: string }
type BuilderRow = BuilderField[]

const EMPTY_FIELD: BuilderField = { id: 'name', label: '' }

function rowsToFieldRows(rows: BuilderRow[]): FieldRow[] {
  return rows
    .filter((row) => row.length > 0)
    .map((row) => row.map((f) => (f.label.trim() ? { id: f.id, label: f.label.trim() } : f.id)))
}

function fieldRowsToBuilderRows(fields: FieldRow[]): BuilderRow[] {
  if (fields.length === 0) return [[{ ...EMPTY_FIELD }]]
  return fields.map((row) =>
    row.map((entry) => (typeof entry === 'string' ? { id: entry, label: '' } : { id: entry.id, label: entry.label ?? '' }))
  )
}

function previewRow(row: FieldRow): string {
  return row.map((entry) => (typeof entry === 'string' ? entry : entry.label ?? entry.id)).join('+')
}

export function CydFieldPresetCard() {
  const qc = useQueryClient()
  const { data: presets, isLoading } = useCydFieldPresets()
  const createMut = useCreateCydFieldPreset()
  const updateMut = useUpdateCydFieldPreset()
  const deleteMut = useDeleteCydFieldPreset()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [rows, setRows] = useState<BuilderRow[]>([[{ ...EMPTY_FIELD }]])
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  function resetForm() {
    setEditingId(null); setName(''); setRows([[{ ...EMPTY_FIELD }]]); setError(null)
  }

  function loadPreset(id: string, presetName: string, fields: FieldRow[]) {
    setEditingId(id); setName(presetName); setRows(fieldRowsToBuilderRows(fields)); setError(null)
  }

  function setFieldAt(rowIdx: number, fieldIdx: number, patch: Partial<BuilderField>) {
    setRows((rs) => rs.map((row, ri) => ri !== rowIdx ? row : row.map((f, fi) => fi === fieldIdx ? { ...f, ...patch } : f)))
  }

  function addFieldTo(rowIdx: number) {
    setRows((rs) => rs.map((row, ri) => ri === rowIdx && row.length < LAYOUT_LIMITS.maxFieldsPerRow ? [...row, { ...EMPTY_FIELD }] : row))
  }

  function removeFieldFrom(rowIdx: number, fieldIdx: number) {
    setRows((rs) => rs.map((row, ri) => ri !== rowIdx ? row : row.filter((_, fi) => fi !== fieldIdx)).filter((row) => row.length > 0))
  }

  function addRow() {
    setRows((rs) => rs.length < LAYOUT_LIMITS.maxRowsPerFieldsPageDefault ? [...rs, [{ ...EMPTY_FIELD }]] : rs)
  }

  function removeRow(rowIdx: number) {
    setRows((rs) => rs.length > 1 ? rs.filter((_, ri) => ri !== rowIdx) : rs)
  }

  async function handleSubmit() {
    setError(null)
    const fields = rowsToFieldRows(rows)
    if (!name.trim() || fields.length === 0) {
      setError('Isi nama preset dan minimal 1 baris field')
      return
    }
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, name: name.trim(), fields })
      } else {
        await createMut.mutateAsync({ name: name.trim(), fields })
      }
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  const saving = createMut.isPending || updateMut.isPending

  return (
    <div className="rounded-[5px] p-5 space-y-4 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🧩 Field Preset CYD</div>
        <div className="text-xs mt-0.5 g-t4">Kombinasi informasi yang ditampilkan per-sel/per-halaman di layout CYD (Ringkas/Detail + custom).</div>
      </div>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1.5">
        {(presets ?? []).map((p) => (
          <div key={p.id} className="px-2 py-1.5 rounded-[5px]" style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs g-t2 flex-1 font-medium">{p.name}</span>
              <button onClick={() => loadPreset(p.id, p.name, p.fields)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
              <button
                onClick={() => {
                  if (!confirm('Yakin hapus preset ini?')) return
                  deleteMut.mutate(p.id, {
                    onError: (e) => { setRowError(e instanceof Error ? e.message : 'Gagal'); qc.invalidateQueries({ queryKey: ['cyd-field-presets'] }) },
                    onSuccess: () => { setRowError(null); if (editingId === p.id) resetForm() },
                  })
                }}
                disabled={deleteMut.isPending}
                className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1 disabled:opacity-40"
              >✕</button>
            </div>
            <div className="text-[10px] g-t5 mt-0.5">{p.fields.map(previewRow).join(' · ')}</div>
          </div>
        ))}
        {(presets ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada preset.</div>
        )}
      </div>
      {rowError && <div className="text-xs text-red-400 mt-2">{rowError}</div>}

      <div>
        <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Nama preset</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Compact ETA"
          className="glass-input w-full h-9 rounded-[5px] px-3 text-sm" />
      </div>

      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center gap-1.5 flex-wrap">
            {row.map((field, fieldIdx) => (
              <div key={fieldIdx} className="flex items-center gap-1">
                <select value={field.id} onChange={(e) => setFieldAt(rowIdx, fieldIdx, { id: e.target.value as FieldId })}
                  className="glass-input h-8 rounded-[5px] px-2 text-xs">
                  {FIELD_ID_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <input value={field.label} onChange={(e) => setFieldAt(rowIdx, fieldIdx, { label: e.target.value })}
                  placeholder="label (opsional)" className="glass-input h-8 w-28 rounded-[5px] px-2 text-xs" />
                <button onClick={() => removeFieldFrom(rowIdx, fieldIdx)} className="text-[10px] g-t4 hover:text-red-400 transition-colors">✕</button>
              </div>
            ))}
            {row.length < LAYOUT_LIMITS.maxFieldsPerRow && (
              <button onClick={() => addFieldTo(rowIdx)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">+ field</button>
            )}
            <button onClick={() => removeRow(rowIdx)} className="text-[10px] g-t5 hover:text-red-400 transition-colors ml-auto">hapus baris</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {rows.length < LAYOUT_LIMITS.maxRowsPerFieldsPageDefault && (
          <button onClick={addRow} className="text-xs px-2.5 py-1 rounded-md g-t4 transition-colors"
            style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            + baris
          </button>
        )}
        <button onClick={handleSubmit} disabled={saving}
          className="text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
          style={{ background: 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
          {editingId ? 'Update preset' : 'Simpan preset'}
        </button>
        {editingId && (
          <button onClick={resetForm} className="text-xs px-3 py-1.5 rounded-md g-t4 transition-colors"
            style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            Batal
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </div>
  )
}
