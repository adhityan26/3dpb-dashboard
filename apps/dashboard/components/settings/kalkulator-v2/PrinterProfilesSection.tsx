'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { hitungMesinPerJam } from '@3pb/kalkulator-core'
import {
  usePrinterProfiles, useCreatePrinterProfile, useUpdatePrinterProfile,
  useDeletePrinterProfile, useSetDefaultPrinterProfile, useSetPricingReferencePrinterProfile,
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
  const setAcuanMut = useSetPricingReferencePrinterProfile()

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
      <p className="text-xs g-t4 mb-2">Biaya mesin per jam per printer (listrik + depresiasi + maintenance). Profil default dipakai saat plate tidak memilih printer. Profil <b>acuan harga</b> (🎯) menentukan floor price & rekomendasi harga jual — HPP tetap pakai printer aktual per plate.</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(profiles ?? []).map(p => (
          <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[5px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <span className="text-xs g-t2 flex-1">
              {p.nama}
              {p.isDefault && (
                <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>default</span>
              )}
              {p.isPricingReference && (
                <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>acuan harga</span>
              )}
            </span>
            <span className="text-xs font-mono g-t1">Rp {Math.round(p.mesinPerJam)}/jam</span>
            {!p.isPricingReference && (
              <button
                onClick={() => setAcuanMut.mutate(p.id, {
                  onError: e => { setRowError(e instanceof Error ? e.message : 'Gagal'); invalidateProfiles() },
                  onSuccess: () => setRowError(null),
                })}
                disabled={setAcuanMut.isPending}
                className="text-[10px] g-t4 hover:text-amber-300 transition-colors px-1 disabled:opacity-40"
                title="Jadikan acuan harga (floor & harga jual dihitung dari mesin ini)">🎯</button>
            )}
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
            placeholder="Bambu Lab P1P" className="glass-input w-full h-9 rounded-[5px] px-3 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Mesin/jam (Rp)</label>
          <input type="number" min="0" value={form.mesinPerJam}
            onChange={e => setForm(f => ({ ...f, mesinPerJam: e.target.value }))}
            placeholder={preview !== undefined ? String(Math.round(preview)) : '4000'}
            className="glass-input w-full h-9 rounded-[5px] px-3 text-sm" />
        </div>
      </div>

      <div className="mt-2">
        <div className="text-[10px] g-t5 mb-1">Atau hitung dari breakdown (kosongkan Mesin/jam untuk pakai hasil hitung):</div>
        <div className="grid grid-cols-5 gap-2">
          {([
            ['watt', 'Watt', '120'], ['tarifPerKwh', 'Rp/kWh', '1445'], ['hargaPrinter', 'Harga printer', '6000000'],
            ['umurPakaiJam', 'Umur (jam)', '2000'], ['maintenancePerJam', 'Maint./jam', '400'],
          ] as const).map(([key, label, hint]) => (
            <div key={key}>
              <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">{label}</label>
              <input type="number" min="0" value={form[key]} placeholder={hint}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="glass-input w-full h-9 rounded-[5px] px-2 text-xs" />
            </div>
          ))}
        </div>
        {preview !== undefined && (
          <div className="text-[10px] mt-1 g-t4">Hasil hitung: <span className="font-mono g-t1">Rp {Math.round(preview)}/jam</span></div>
        )}
        <details className="mt-2 rounded-[5px] px-3 py-2"
                 style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
          <summary className="text-[11px] g-t3 cursor-pointer select-none">💡 Cara mengisi breakdown</summary>
          <div className="text-[10px] g-t4 mt-2 space-y-1.5 leading-relaxed">
            <p><b className="g-t2">Watt</b> — konsumsi listrik <i>rata-rata saat printing</i>, bukan angka maksimum PSU di spesifikasi (itu cuma peak saat heat-up bed). Paling akurat diukur pakai smart plug / watt meter selama ±1 jam print. Patokan: P1P/A1 print PLA ≈ 90–130 W; ABS/ASA (bed panas terus) ≈ 150–250 W; printer resin ≈ 60–100 W.</p>
            <p><b className="g-t2">Rp/kWh</b> — tarif listrik PLN sesuai golongan (cek tagihan / PLN Mobile): R-1 1.300–2.200 VA ≈ 1.445; R-2/R-3 ≥3.500 VA ≈ 1.700; 900 VA non-subsidi ≈ 1.352.</p>
            <p><b className="g-t2">Harga printer</b> — harga beli unit. <b className="g-t2">Umur (jam)</b> — perkiraan total jam print sepanjang umur ekonomisnya (FDM umumnya 2.000–5.000 jam). Dua angka ini jadi biaya depresiasi: harga ÷ umur.</p>
            <p><b className="g-t2">Maint./jam</b> — opsional. Perkiraan biaya sparepart & perawatan setahun (nozzle, belt, lube, PTFE) dibagi jam print setahun. Contoh: Rp600rb ÷ 1.500 jam ≈ Rp400/jam.</p>
            <p className="font-mono g-t5">mesin/jam = (watt÷1000 × Rp/kWh) + (harga ÷ umur) + maint/jam</p>
            <p className="g-t5">Contoh P1P: (120÷1000 × 1.445) + (6.000.000 ÷ 2.000) + 800 ≈ Rp3.973/jam — didominasi depresiasi, bukan listrik. Kalau hasil hitung tidak cocok dengan feeling, isi kolom Mesin/jam manual — nilai manual selalu menang.</p>
          </div>
        </details>
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
