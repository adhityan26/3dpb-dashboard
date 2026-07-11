'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { hitungMesinPerJam } from '@3pb/kalkulator-core'
import {
  usePrinterProfiles, useCreatePrinterProfile, useUpdatePrinterProfile,
  useDeletePrinterProfile, useSetDefaultPrinterProfile,
} from '@/lib/hooks/use-kalkulator'
import type { PrinterProfileData } from '@/lib/kalkulator/profiles-service'

const EMPTY = { nama: '', mesinPerJam: '', watt: '', tarifPerKwh: '', hargaPrinter: '', umurPakaiJam: '', maintenancePerJam: '' }

function num(v: string): number | undefined {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

export function PrinterProfilesSection() {
  const qc = useQueryClient()
  const { data: profiles, isLoading } = usePrinterProfiles()
  const createMut = useCreatePrinterProfile()
  const updateMut = useUpdatePrinterProfile()
  const deleteMut = useDeletePrinterProfile()
  const setDefaultMut = useSetDefaultPrinterProfile()

  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  function invalidateProfiles() {
    qc.invalidateQueries({ queryKey: ['kalkulator', 'printer-profiles'] })
  }

  const breakdown = {
    watt: num(form.watt), tarifPerKwh: num(form.tarifPerKwh),
    hargaPrinter: num(form.hargaPrinter), umurPakaiJam: num(form.umurPakaiJam),
    maintenancePerJam: num(form.maintenancePerJam),
  }
  const breakdownLengkap = breakdown.watt !== undefined && breakdown.tarifPerKwh !== undefined
    && breakdown.hargaPrinter !== undefined && breakdown.umurPakaiJam !== undefined
  const preview = breakdownLengkap
    ? hitungMesinPerJam({
        watt: breakdown.watt!, tarifPerKwh: breakdown.tarifPerKwh!,
        hargaPrinter: breakdown.hargaPrinter!, umurPakaiJam: breakdown.umurPakaiJam!,
        maintenancePerJam: breakdown.maintenancePerJam,
      })
    : undefined
  const mesinManual = num(form.mesinPerJam)
  const mesinFinal = mesinManual ?? preview

  function startEdit(p: PrinterProfileData) {
    setEditingId(p.id)
    setForm({
      nama: p.nama, mesinPerJam: String(p.mesinPerJam),
      watt: p.watt != null ? String(p.watt) : '', tarifPerKwh: p.tarifPerKwh != null ? String(p.tarifPerKwh) : '',
      hargaPrinter: p.hargaPrinter != null ? String(p.hargaPrinter) : '', umurPakaiJam: p.umurPakaiJam != null ? String(p.umurPakaiJam) : '',
      maintenancePerJam: p.maintenancePerJam != null ? String(p.maintenancePerJam) : '',
    })
  }

  async function handleSubmit() {
    setError(null)
    if (!form.nama.trim() || mesinFinal === undefined) {
      setError('Isi nama dan mesin/jam (langsung atau lengkapi breakdown)')
      return
    }
    // Selalu kirim mesinPerJam eksplisit — hindari recompute diam-diam di server
    const input = { nama: form.nama.trim(), mesinPerJam: mesinFinal, ...breakdown }
    try {
      if (editingId) await updateMut.mutateAsync({ id: editingId, input })
      else await createMut.mutateAsync(input)
      setForm(EMPTY)
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🖨️ Printer Profile</div>
      <p className="text-xs g-t4 mb-2">Biaya mesin per jam per printer (listrik + depresiasi + maintenance). Profil default dipakai saat plate tidak memilih printer.</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(profiles ?? []).map(p => (
          <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <span className="text-xs g-t2 flex-1">
              {p.nama}
              {p.isDefault && (
                <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>default</span>
              )}
            </span>
            <span className="text-xs font-mono g-t1">Rp {Math.round(p.mesinPerJam)}/jam</span>
            <button onClick={() => startEdit(p)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
            {!p.isDefault && (
              <>
                <button
                  onClick={() => setDefaultMut.mutate(p.id, {
                    onError: e => { setRowError(e instanceof Error ? e.message : 'Gagal'); invalidateProfiles() },
                    onSuccess: () => setRowError(null),
                  })}
                  disabled={setDefaultMut.isPending}
                  className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1 disabled:opacity-40"
                  title="Jadikan default">★</button>
                <button
                  onClick={() => deleteMut.mutate(p.id, {
                    onError: e => { setRowError(e instanceof Error ? e.message : 'Gagal'); invalidateProfiles() },
                    onSuccess: () => setRowError(null),
                  })}
                  disabled={deleteMut.isPending}
                  className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1 disabled:opacity-40">✕</button>
              </>
            )}
          </div>
        ))}
        {(profiles ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada profil. Jalankan seed atau tambah manual.</div>
        )}
      </div>
      {rowError && <div className="text-xs text-red-400 mt-2">{rowError}</div>}

      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="col-span-2">
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Nama printer</label>
          <input value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
            placeholder="Bambu Lab P1P" className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Mesin/jam (Rp)</label>
          <input type="number" min="0" value={form.mesinPerJam}
            onChange={e => setForm(f => ({ ...f, mesinPerJam: e.target.value }))}
            placeholder={preview !== undefined ? String(Math.round(preview)) : '4000'}
            className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
        </div>
      </div>

      <div className="mt-2">
        <div className="text-[10px] g-t5 mb-1">Atau hitung dari breakdown (kosongkan Mesin/jam untuk pakai hasil hitung):</div>
        <div className="grid grid-cols-5 gap-2">
          {([
            ['watt', 'Watt'], ['tarifPerKwh', 'Rp/kWh'], ['hargaPrinter', 'Harga printer'],
            ['umurPakaiJam', 'Umur (jam)'], ['maintenancePerJam', 'Maint./jam'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">{label}</label>
              <input type="number" min="0" value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="glass-input w-full h-9 rounded-[8px] px-2 text-xs" />
            </div>
          ))}
        </div>
        {preview !== undefined && (
          <div className="text-[10px] mt-1 g-t4">Hasil hitung: <span className="font-mono g-t1">Rp {Math.round(preview)}/jam</span></div>
        )}
      </div>

      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      <div className="flex gap-2 mt-2">
        <button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
          style={{ background: 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
          {editingId ? 'Update profil' : '+ Tambah profil'}
        </button>
        {editingId && (
          <button onClick={() => { setEditingId(null); setForm(EMPTY); setError(null) }}
            className="text-xs px-3 py-1.5 rounded-md g-t4 transition-colors"
            style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            Batal
          </button>
        )}
      </div>
    </div>
  )
}
