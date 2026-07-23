'use client'

import { useState } from 'react'
import { useSettingsV2, useUpdateRates } from '@/lib/hooks/use-kalkulator'

export function ChannelsSection() {
  const { data: settings, isLoading } = useSettingsV2()
  const updateMut = useUpdateRates()

  const [fees, setFees] = useState<Record<string, string>>({})
  const [margins, setMargins] = useState({ a: '', b: '', c: '', reseller: '' })
  const [newId, setNewId] = useState('')
  const [newFee, setNewFee] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sync data yang datang async ke state form lokal tanpa useEffect
  // (menghindari cascading render); pola "adjust state during render".
  const [syncedSettings, setSyncedSettings] = useState(settings)

  if (settings && settings !== syncedSettings) {
    setSyncedSettings(settings)
    setFees(Object.fromEntries(settings.channels.map(c => [c.id, String(c.feeMultiplier)])))
    setMargins({
      a: String(settings.marginMultipliers.A), b: String(settings.marginMultipliers.B),
      c: String(settings.marginMultipliers.C), reseller: String(settings.resellerBulkMultiplier),
    })
  }

  async function handleSave() {
    setError(null)
    const updates: { key: string; value: string }[] = []
    for (const [id, fee] of Object.entries(fees)) {
      if (id === 'offline') continue // offline selalu 1, tidak diedit
      if (fee.trim() !== '' && Number.isFinite(parseFloat(fee))) updates.push({ key: `kalk.channel.${id}`, value: fee.trim() })
    }
    if (margins.a) updates.push({ key: 'kalk.margin.a', value: margins.a })
    if (margins.b) updates.push({ key: 'kalk.margin.b', value: margins.b })
    if (margins.c) updates.push({ key: 'kalk.margin.c', value: margins.c })
    if (margins.reseller) updates.push({ key: 'kalk.resellerBulk.multiplier', value: margins.reseller })
    try {
      await updateMut.mutateAsync(updates)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  async function handleAddChannel() {
    setError(null)
    const id = newId.trim().toLowerCase()
    const fee = parseFloat(newFee)
    if (!/^[a-z0-9-]+$/.test(id) || id === 'offline') {
      setError('ID channel: huruf kecil/angka/strip, bukan "offline"')
      return
    }
    if (!Number.isFinite(fee) || fee <= 0) {
      setError('Fee multiplier harus angka > 0 (contoh: 1.2 = fee 20%)')
      return
    }
    try {
      await updateMut.mutateAsync([{ key: `kalk.channel.${id}`, value: String(fee) }])
      setNewId(''); setNewFee('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  if (isLoading) return <div className="text-xs g-t5 py-2">Memuat…</div>

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🛒 Channel &amp; Margin</div>
      <p className="text-xs g-t4 mb-2">Fee multiplier per channel penjualan (1.2 = harga dinaikkan 20% untuk menutup fee marketplace). Offline selalu 1. Channel tersimpan sebagai Config <code className="font-mono">kalk.channel.*</code>.</p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {(settings?.channels ?? []).map(c => (
          <div key={c.id}>
            <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">{c.nama}</label>
            <input type="number" min="1" step="0.01" value={fees[c.id] ?? ''} disabled={c.id === 'offline'}
              onChange={e => setFees(f => ({ ...f, [c.id]: e.target.value }))}
              className="glass-input w-full h-9 rounded-[5px] px-3 text-sm disabled:opacity-50" />
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-end mb-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] g-t4 uppercase tracking-wide">Channel baru (id)</label>
          <input value={newId} onChange={e => setNewId(e.target.value)}
            placeholder="tokopedia" className="glass-input text-xs px-2 py-1.5 rounded-md w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] g-t4 uppercase tracking-wide">Fee ×</label>
          <input type="number" min="1" step="0.01" value={newFee} onChange={e => setNewFee(e.target.value)}
            placeholder="1.1" className="glass-input text-xs px-2 py-1.5 rounded-md w-20" />
        </div>
        <button onClick={handleAddChannel} disabled={updateMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
          + Tambah channel
        </button>
      </div>

      <div className="text-[10px] g-t5 mb-3">Margin tier & reseller bulk (dikali floor price):</div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {([['a', 'Margin Kompetitif ×'], ['b', 'Margin Standard ×'], ['c', 'Margin Premium ×'], ['reseller', 'Reseller bulk ×']] as const).map(([key, label]) => (
          <div key={key}>
            <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">{label}</label>
            <input type="number" min="1" step="0.05" value={margins[key]}
              onChange={e => setMargins(m => ({ ...m, [key]: e.target.value }))}
              className="glass-input w-full h-9 rounded-[5px] px-3 text-sm" />
          </div>
        ))}
      </div>

      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
      <button onClick={handleSave} disabled={updateMut.isPending}
        className="text-xs px-4 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
        style={{ background: saved ? 'rgba(52,211,153,0.3)' : 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
        {updateMut.isPending ? 'Menyimpan…' : saved ? '✓ Tersimpan' : 'Simpan channel & margin'}
      </button>
    </div>
  )
}
