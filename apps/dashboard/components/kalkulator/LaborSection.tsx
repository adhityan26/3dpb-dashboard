"use client"

import { useRef } from "react"
import { useLaborPresets } from "@/lib/hooks/use-kalkulator"
import type { LaborRow } from "@/lib/kalkulator/form-v2"

interface Props { rows: LaborRow[]; onRowsChange: (rows: LaborRow[]) => void }

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
const rowCost = (l: LaborRow) => (l.jam ?? 0) * (l.ratePerJam ?? 0) + (l.flat ?? 0)

export function LaborSection({ rows, onRowsChange }: Props) {
  const idRef = useRef(0)
  function nextId() { return `lb-${++idRef.current}` }
  const { data: presets } = useLaborPresets()

  function set(id: string, partial: Partial<LaborRow>) {
    onRowsChange(rows.map(r => r.id === id ? { ...r, ...partial } : r))
  }
  const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : undefined }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">Labor / Finishing</div>

      {/* Preset picker */}
      {(presets ?? []).length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {(presets ?? []).map(p => (
            <button key={p.id}
              onClick={() => onRowsChange([...rows, ...p.items.map(i => ({ id: nextId(), ...i }))])}
              className="px-3 py-1.5 rounded-[5px] text-[11px] font-medium transition-all hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
              title={p.items.map(i => `${i.nama}: ${fmt(rowCost({ id: '', ...i }))}`).join(" · ")}>
              + {p.nama}
            </button>
          ))}
        </div>
      )}

      {rows.map(r => (
        <div key={r.id} className="grid gap-2 mb-2 items-center" style={{ gridTemplateColumns: "1fr 64px 90px 90px 70px 32px" }}>
          <input type="text" placeholder="Sanding, painting..." value={r.nama}
            onChange={e => set(r.id, { nama: e.target.value })}
            className="glass-input w-full h-9 rounded-[5px] px-3 text-xs" />
          <input type="number" min="0" step="0.25" placeholder="jam" value={r.jam ?? ""}
            onChange={e => set(r.id, { jam: num(e.target.value) })}
            className="glass-input w-full h-9 rounded-[5px] px-2 text-xs" />
          <input type="number" min="0" step="1000" placeholder="Rp/jam" value={r.ratePerJam ?? ""}
            onChange={e => set(r.id, { ratePerJam: num(e.target.value) })}
            className="glass-input w-full h-9 rounded-[5px] px-2 text-xs" />
          <input type="number" min="0" step="1000" placeholder="flat Rp" value={r.flat ?? ""}
            onChange={e => set(r.id, { flat: num(e.target.value) })}
            className="glass-input w-full h-9 rounded-[5px] px-2 text-xs" />
          <span className="text-[10px] font-mono text-right g-t3">{fmt(rowCost(r))}</span>
          <button onClick={() => onRowsChange(rows.filter(x => x.id !== r.id))}
            className="h-9 w-8 rounded-[5px] flex items-center justify-center text-sm"
            style={{ color: "var(--g-t4)", background: "var(--g-inner)" }}>✕</button>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button onClick={() => onRowsChange([...rows, { id: nextId(), nama: "" }])}
          className="text-sm font-medium transition-colors" style={{ color: "rgba(99,102,241,0.7)" }}>
          + Tambah labor
        </button>
        {rows.length > 0 && (
          <span className="text-[10px] g-t4 ml-auto">Total: <span className="font-mono g-t2">{fmt(rows.reduce((s, r) => s + rowCost(r), 0))}</span> /unit</span>
        )}
      </div>
    </div>
  )
}
