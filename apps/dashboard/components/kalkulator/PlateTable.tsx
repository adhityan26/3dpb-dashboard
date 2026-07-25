"use client"

import { useState, useRef, useEffect } from "react"
import type { PlateInputApp, PrintTipe, FilamentEntry, FilamentHargaData } from "@/lib/kalkulator/types"
import type { MaterialProfileData } from "@/lib/kalkulator/profiles-service"
import { useFilamentHarga, usePrinterProfiles, useMaterialProfiles } from "@/lib/hooks/use-kalkulator"
import { useCatalog } from "@/lib/hooks/use-filamen"
import { HexColorSwatch, HexColorPicker, isValidHexColor, type HexColorPickerOption } from "@3pb/ui"
import { findCatalogColorsForFilament, findCatalogColorName, sortCatalogColors } from "@/lib/kalkulator/color-catalog"
import { ImageZoomModal } from "@/components/ui/ImageZoomModal"

interface PlateRow extends PlateInputApp {
  key: string
}

interface PlateTableProps {
  plates: PlateRow[]
  onChange: (plates: PlateRow[]) => void
  /** Batch unit — kalau > 1, baris TOTAL menampilkan juga gram & durasi per pcs */
  batch?: number
  /** URL thumbnail per plate.key — blob URL (pending, belum ke-save) atau endpoint proxy
   *  (/api/kalkulator/plates/{id}/thumbnail, sudah ke-save). Key yang ga ada di map = ga
   *  ada thumbnail, elemen img tidak dirender. */
  thumbnailUrls?: Record<string, string>
}

function parseDurasi(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed.includes(":")) {
    const [h, m] = trimmed.split(":").map(Number)
    return (h || 0) + (m || 0) / 60
  }
  return parseFloat(trimmed) || 0
}

function formatDurasiDisplay(jam: number): string {
  if (!jam) return ""
  const h = Math.floor(jam)
  const m = Math.round((jam - h) * 60)
  return m === 0 ? `${h}j` : `${h}j ${m}m`
}

/** Cocokin nama profile ("PLA", "PETG", ...) ke material filament ("PLA+", "PLA Basic", ...)
 *  pakai substring dua arah, biar "PLA" match "PLA Basic" dan sebaliknya. */
function materialProfileMatchesFilament(profileNama: string, filamentMaterial: string): boolean {
  const p = profileNama.trim().toLowerCase()
  const f = filamentMaterial.trim().toLowerCase()
  if (!p || !f) return true
  return f.includes(p) || p.includes(f)
}

function MaterialProfilePicker({ profiles, tipe, selectedId, onSelect, filamentMaterial }: {
  profiles: MaterialProfileData[]
  tipe: "FDM" | "SLA"
  selectedId?: string
  onSelect: (id: string | undefined) => void
  /** Material filament yang lagi dipilih (mis. "PLA+") — kalau diisi, list di-filter biar
   *  profile material lain (ABS, TPU, dst) ga muncul. Fallback ke list penuh kalau nggak
   *  ada yang cocok, biar picker ga hilang total pas user belum bikin profile buat material itu. */
  filamentMaterial?: string
}) {
  const byTipe = profiles.filter(m => m.tipe === tipe)
  const matched = filamentMaterial
    ? byTipe.filter(m => materialProfileMatchesFilament(m.nama, filamentMaterial))
    : byTipe
  const list = matched.length > 0 ? matched : byTipe
  if (list.length === 0) return null
  return (
    <select
      value={selectedId ?? ""}
      onChange={e => onSelect(e.target.value || undefined)}
      className="glass-input h-7 rounded-[5px] px-2 text-[10px]"
      title="Profil material (hpp/jual/failure per jenis)"
    >
      <option value="">Profil material: default {tipe}</option>
      {list.map(m => (
        <option key={m.id} value={m.id}>{m.nama} · Rp{m.hppPerGram}/g · fail {m.failureRatePct}%</option>
      ))}
    </select>
  )
}

function FilamentPicker({ filaments, selectedId, onSelect, onClear }: {
  filaments: FilamentHargaData[]
  selectedId?: string
  onSelect: (f: FilamentHargaData) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const selected = filaments.find(f => f.id === selectedId)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = search.trim()
    ? filaments.filter(f =>
        `${f.brand} ${f.material}`.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : filaments.slice(0, 8)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="h-8 px-2.5 rounded-[5px] text-[10px] font-medium transition-all flex items-center gap-1 max-w-full"
        style={selected
          ? { background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }
          : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t3)" }
        }
      >
        <span>🧵</span>
        <span className="truncate max-w-[120px]">
          {selected ? `${selected.brand} · ${selected.material} · Rp ${selected.hargaPerGram}/g` : "Pilih filament"}
        </span>
        {selected && (
          <span
            onClick={e => { e.stopPropagation(); onClear() }}
            className="ml-1 hover:text-red-400 cursor-pointer"
          >✕</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 rounded-[5px] shadow-xl overflow-hidden"
             style={{ background: "rgba(22,23,38,0.97)", border: "1px solid rgba(99,102,241,0.2)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <div className="p-2">
            <input
              type="text"
              autoFocus
              placeholder="Cari brand / material..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="glass-input w-full h-8 rounded-[5px] px-2 text-xs"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="text-[10px] text-center py-3 g-t5">Tidak ditemukan</div>
            )}
            {filtered.map(f => (
              <button
                key={f.id}
                onClick={() => { onSelect(f); setOpen(false); setSearch("") }}
                className="w-full text-left px-3 py-2 text-xs transition-all flex justify-between items-center"
                style={f.id === selectedId
                  ? { background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }
                  : { color: "var(--g-t1)" }
                }
                onMouseEnter={e => { if (f.id !== selectedId) e.currentTarget.style.background = "var(--g-hover)" }}
                onMouseLeave={e => { if (f.id !== selectedId) e.currentTarget.style.background = "" }}
              >
                <span className="font-medium">{f.brand} <span className="g-t3 font-normal">· {f.material}</span></span>
                <span style={{ color: "#a5b4fc" }}>Rp {f.hargaPerGram}/g</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function PlateTable({ plates, onChange, batch, thumbnailUrls }: PlateTableProps) {
  const [durasiRaw, setDurasiRaw] = useState<Record<string, string>>({})
  const [zoomedThumbnail, setZoomedThumbnail] = useState<{ src: string; alt: string } | null>(null)
  const keyCounterRef = useRef(0)
  function nextKey() { return `plate-${++keyCounterRef.current}` }

  const { data: filamentHargaData } = useFilamentHarga()
  const filamentCatalog: FilamentHargaData[] = filamentHargaData ?? []
  const { data: printerProfiles } = usePrinterProfiles()
  const { data: materialProfiles } = useMaterialProfiles()
  const { data: catalogData } = useCatalog()

  function colorOptionsFor(brand: string, material: string, referenceColor: string | undefined): HexColorPickerOption[] {
    if (!brand.trim() && !material.trim()) return []
    const catalog = catalogData?.catalog ?? {}
    const matched = findCatalogColorsForFilament(catalog, brand, material)
    return sortCatalogColors(matched, referenceColor).map(e => ({ id: e.id, colorName: e.colorName, colorHex: e.colorHex }))
  }

  /** Nama warna katalog buat ditampilin — cuma muncul kalau brand+material EXACT match
   *  (bukan fuzzy, beda dari colorOptionsFor) dan hex-nya persis sama. */
  function colorNameFor(brand: string, material: string, colorHex: string): string | null {
    return findCatalogColorName(catalogData?.catalog ?? {}, brand, material, colorHex)
  }

  function addPlate() {
    const key = nextKey()
    onChange([...plates, { key, tipe: "FDM", gramasi: 0, durasiJam: 0 }])
    setDurasiRaw(prev => ({ ...prev, [key]: "" }))
  }

  function removePlate(key: string) {
    if (plates.length <= 1) return
    onChange(plates.filter(p => p.key !== key))
    setDurasiRaw(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  function updatePlate<K extends keyof PlateInputApp>(key: string, field: K, value: PlateInputApp[K]) {
    onChange(plates.map(p => p.key === key ? { ...p, [field]: value } : p))
  }

  function updatePlateFields(key: string, partial: Partial<PlateInputApp>) {
    onChange(plates.map(p => p.key === key ? { ...p, ...partial } : p))
  }

  function handleDurasiChange(key: string, raw: string) {
    setDurasiRaw(prev => ({ ...prev, [key]: raw }))
    updatePlate(key, "durasiJam", parseDurasi(raw))
  }

  // Multi-material helpers
  function toggleMultiMaterial(key: string) {
    const plate = plates.find(p => p.key === key)
    if (!plate) return
    const isMulti = (plate.materials?.length ?? 0) > 0

    if (isMulti) {
      // Switch back to single: clear materials
      onChange(plates.map(p => p.key === key ? { ...p, materials: undefined } : p))
    } else {
      // Switch to multi: seed first entry from existing tipe+gramasi
      const firstEntry: FilamentEntry = {
        brand: "",
        material: plate.tipe === "SLA" ? "Resin" : "PLA+",
        color: "",
        gramasi: plate.gramasi ?? 0,
        isSupport: false,
      }
      onChange(plates.map(p => p.key === key ? { ...p, materials: [firstEntry] } : p))
    }
  }

  function addMaterial(key: string) {
    const plate = plates.find(p => p.key === key)
    if (!plate) return
    const newEntry: FilamentEntry = { brand: "", material: "PLA+", color: "", gramasi: 0, isSupport: false }
    onChange(plates.map(p =>
      p.key === key ? { ...p, materials: [...(p.materials ?? []), newEntry] } : p
    ))
  }

  function updateMaterial(key: string, idx: number, field: keyof FilamentEntry, value: string | number | boolean | undefined) {
    onChange(plates.map(p => {
      if (p.key !== key) return p
      const mats = [...(p.materials ?? [])]
      mats[idx] = { ...mats[idx], [field]: value }
      return { ...p, materials: mats }
    }))
  }

  function setMaterialFromCatalog(key: string, idx: number, f: FilamentHargaData | null) {
    onChange(plates.map(p => {
      if (p.key !== key) return p
      const mats = [...(p.materials ?? [])]
      if (f) {
        mats[idx] = { ...mats[idx], brand: f.brand, material: f.material, hargaPerGram: f.hargaPerGram, filamentId: f.id }
      } else {
        mats[idx] = { ...mats[idx], brand: "", material: "", hargaPerGram: undefined, filamentId: undefined }
      }
      return { ...p, materials: mats }
    }))
  }

  function removeMaterial(key: string, idx: number) {
    onChange(plates.map(p => {
      if (p.key !== key) return p
      const mats = (p.materials ?? []).filter((_, i) => i !== idx)
      // If no materials left, revert to single mode
      return { ...p, materials: mats.length > 0 ? mats : undefined }
    }))
  }

  // Total gramasi accounts for multi-material plates
  const totalGramasi = plates.reduce((s, p) => {
    if ((p.materials?.length ?? 0) > 0) {
      return s + (p.materials ?? []).reduce((ms, m) => ms + (m.gramasi || 0), 0)
    }
    return s + (p.gramasi || 0)
  }, 0)
  const totalDurasi = plates.reduce((s, p) => s + (p.durasiJam || 0), 0)
  const multiPlate = plates.length > 1

  /** Kartu material — struktur SERAGAM buat mode single & multi (baris 1 = Filament
   *  full-width [+ Tipe fallback kalau belum ada filament], baris 2 = Profil · Warna ·
   *  Gramasi · [Sup + Hapus khusus multi] sejajar satu baris). */
  function renderMaterialCard(params: {
    key: string
    filamentSelectedId?: string
    onFilamentSelect: (f: FilamentHargaData) => void
    onFilamentClear: () => void
    tipe: PrintTipe
    onTipeChange?: (t: PrintTipe) => void
    brand: string
    material: string
    materialProfileId?: string
    onMaterialProfileSelect: (id: string | undefined) => void
    color: string
    onColorChange: (hex: string) => void
    gramasi: number
    onGramasiChange: (g: number) => void
    isSupport?: boolean
    onSupportChange?: (v: boolean) => void
    onRemove?: () => void
  }) {
    const hasFilament = !!params.filamentSelectedId
    const colorName = colorNameFor(params.brand, params.material, params.color)
    return (
      <div key={params.key}
           className="rounded-[5px] p-2 space-y-1.5"
           style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
        {/* Baris 1: Filament full-width + Tipe fallback (cuma kalau belum pilih filament) */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0">
            <FilamentPicker
              filaments={filamentCatalog}
              selectedId={params.filamentSelectedId}
              onSelect={params.onFilamentSelect}
              onClear={params.onFilamentClear}
            />
          </div>
          {!hasFilament && params.onTipeChange && (
            <div className="flex gap-1 shrink-0">
              {(["FDM", "SLA"] as PrintTipe[]).map(t => (
                <button
                  key={t}
                  onClick={() => params.onTipeChange!(t)}
                  className="h-8 px-2.5 rounded-[5px] text-[10px] font-bold transition-all"
                  style={params.tipe === t
                    ? { background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
                    : { background: "var(--g-card)", border: "1px solid var(--g-inner-border)", color: "var(--g-t3)" }
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Baris 2: Profil, Warna, Gramasi, [Sup + Hapus] — semua sejajar */}
        <div className="flex items-end gap-1.5 flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-1 g-accent">Profil</div>
            <MaterialProfilePicker
              profiles={materialProfiles ?? []}
              tipe={params.tipe === "SLA" ? "SLA" : "FDM"}
              selectedId={params.materialProfileId}
              onSelect={params.onMaterialProfileSelect}
              filamentMaterial={params.material || undefined}
            />
          </div>
          <div className="shrink-0" style={{ width: 112 }}>
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-1 g-accent">Warna</div>
            <div className="relative">
              <HexColorPicker
                color={params.color}
                options={colorOptionsFor(params.brand, params.material, params.color)}
                onSelect={params.onColorChange}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10"
              />
              <input
                type="text"
                placeholder="Warna"
                value={params.color}
                onChange={e => params.onColorChange(e.target.value)}
                title={colorName || undefined}
                className="glass-input h-8 rounded-[5px] pr-1.5 text-[11px] w-full font-mono tracking-tight"
                style={{ paddingLeft: isValidHexColor(params.color) ? "24px" : "8px" }}
              />
            </div>
          </div>
          <div className="shrink-0" style={{ width: 200 }}>
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-1 g-accent">Gramasi</div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="0"
                value={params.gramasi || ""}
                onChange={e => params.onGramasiChange(parseFloat(e.target.value) || 0)}
                className="glass-input h-8 rounded-[5px] pl-2 pr-6 text-xs w-full"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] g-accent"
                    style={{ pointerEvents: "none" }}>g</span>
            </div>
          </div>
          {params.onRemove && (
            <div className="flex items-center gap-1.5 h-8 shrink-0">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.isSupport ?? false}
                  onChange={e => params.onSupportChange?.(e.target.checked)}
                  className="w-3 h-3 accent-indigo-400"
                />
                <span className="text-[9px] g-t3">Sup</span>
              </label>
              <button
                onClick={params.onRemove}
                className="h-8 w-6 flex items-center justify-center rounded-[5px] text-xs transition-all shrink-0"
                style={{ color: "var(--g-t5)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.7)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--g-t5)")}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {plates.map((plate, idx) => {
        const isMultiMode = (plate.materials?.length ?? 0) > 0
        const multiGramasi = isMultiMode
          ? (plate.materials ?? []).reduce((s, m) => s + (m.gramasi || 0), 0)
          : 0

        return (
          <div key={plate.key}
            className="rounded-[5px] p-3"
            style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}>

            {/* Topbar: thumbnail (multi-plate) + Nama Part (SELALU tampil, single/multi-plate) +
                toggle Multi-material + hapus plate (multi-plate saja) */}
            <div className="flex items-center gap-2 mb-2">
              {multiPlate && thumbnailUrls?.[plate.key] && (
                <img
                  src={thumbnailUrls[plate.key]}
                  alt=""
                  onClick={() => setZoomedThumbnail({ src: thumbnailUrls[plate.key], alt: plate.namaPart ?? `Part ${idx + 1}` })}
                  className="w-10 h-10 rounded-[5px] object-cover flex-shrink-0 cursor-zoom-in hover:ring-2 hover:ring-[color:var(--g-accent)]"
                  style={{ border: "1px solid var(--g-inner-border)" }}
                />
              )}
              {multiPlate && (
                <span className="text-[10px] font-semibold g-accent shrink-0">
                  Part {idx + 1}
                </span>
              )}
              <input
                type="text"
                placeholder="Nama part (opsional)"
                value={plate.namaPart ?? ""}
                onChange={e => updatePlate(plate.key, "namaPart", e.target.value || undefined)}
                className="glass-input flex-1 h-8 rounded-[5px] px-3 text-xs"
              />
              <button
                onClick={() => toggleMultiMaterial(plate.key)}
                className="h-8 px-2.5 rounded-[5px] text-[10px] font-semibold transition-all flex-shrink-0"
                style={isMultiMode
                  ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
                  : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t3)" }
                }
                title={isMultiMode ? "Kembali ke single material" : "Aktifkan multi-material (AMS)"}
              >
                {isMultiMode ? "✕ Multi" : "🎨 Multi"}
              </button>
              {multiPlate && (
                <button
                  onClick={() => removePlate(plate.key)}
                  className="h-8 w-8 rounded-[5px] flex items-center justify-center text-sm transition-all flex-shrink-0"
                  style={{ color: "var(--g-t4)", background: "var(--g-inner)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.7)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--g-t4)")}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Durasi — satu field, posisi sama di kedua mode */}
            <div className="mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Durasi</div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="1:30 atau 1.5"
                  value={durasiRaw[plate.key] ?? (plate.durasiJam ? String(parseFloat(plate.durasiJam.toFixed(2))) : "")}
                  onChange={e => handleDurasiChange(plate.key, e.target.value)}
                  className="glass-input w-full h-10 rounded-[5px] px-3 text-sm"
                />
                {plate.durasiJam > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]"
                        style={{ color: "rgba(99,102,241,0.7)" }}>
                    {formatDurasiDisplay(plate.durasiJam)}
                  </span>
                )}
              </div>
            </div>

            {/* SINGLE MATERIAL MODE */}
            {!isMultiMode && (
              renderMaterialCard({
                key: "single",
                filamentSelectedId: plate.filamentHargaId,
                onFilamentSelect: f => updatePlateFields(plate.key, { filamentHargaId: f.id, hargaPerGram: f.hargaPerGram }),
                onFilamentClear: () => updatePlateFields(plate.key, { filamentHargaId: undefined, hargaPerGram: undefined }),
                tipe: plate.tipe === "SLA" ? "SLA" : "FDM",
                onTipeChange: t => updatePlate(plate.key, "tipe", t),
                brand: filamentCatalog.find(f => f.id === plate.filamentHargaId)?.brand ?? "",
                material: filamentCatalog.find(f => f.id === plate.filamentHargaId)?.material ?? "",
                materialProfileId: plate.materialProfileId,
                onMaterialProfileSelect: id => updatePlateFields(plate.key, { materialProfileId: id }),
                color: plate.color ?? "",
                onColorChange: hex => updatePlate(plate.key, "color", hex),
                gramasi: plate.gramasi ?? 0,
                onGramasiChange: g => updatePlate(plate.key, "gramasi", g),
              })
            )}

            {/* MULTI-MATERIAL MODE — 1 kartu per material, struktur sama seperti mode single. */}
            {isMultiMode && (
              <div className="space-y-1.5">
                {(plate.materials ?? []).map((mat, mIdx) => renderMaterialCard({
                  key: String(mIdx),
                  filamentSelectedId: mat.filamentId,
                  onFilamentSelect: f => setMaterialFromCatalog(plate.key, mIdx, f),
                  onFilamentClear: () => setMaterialFromCatalog(plate.key, mIdx, null),
                  tipe: plate.tipe === "SLA" ? "SLA" : "FDM",
                  brand: mat.brand,
                  material: mat.material,
                  materialProfileId: mat.materialProfileId,
                  onMaterialProfileSelect: id => updateMaterial(plate.key, mIdx, "materialProfileId", id),
                  color: mat.color,
                  onColorChange: hex => updateMaterial(plate.key, mIdx, "color", hex),
                  gramasi: mat.gramasi,
                  onGramasiChange: g => updateMaterial(plate.key, mIdx, "gramasi", g),
                  isSupport: mat.isSupport,
                  onSupportChange: v => updateMaterial(plate.key, mIdx, "isSupport", v),
                  onRemove: () => removeMaterial(plate.key, mIdx),
                }))}

                {/* Total gramasi + add button */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => addMaterial(plate.key)}
                    className="text-xs font-medium transition-colors"
                    style={{ color: "rgba(99,102,241,0.7)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}
                  >
                    + Tambah Material
                  </button>
                  <span className="text-[10px] font-semibold g-accent">
                    Total: {multiGramasi.toFixed(1)}g
                  </span>
                </div>
              </div>
            )}

            {/* Printer selector — always shown */}
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 g-accent">Printer</div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => updatePlateFields(plate.key, { printer: undefined, printerProfileId: undefined })}
                  className="h-8 px-3 rounded-[5px] text-xs transition-all"
                  style={!plate.printerProfileId
                    ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
                    : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t4)" }}
                  title="Tanpa profil — pakai rate mesin global"
                >—</button>
                {(printerProfiles ?? []).map(pp => (
                  <button
                    key={pp.id}
                    onClick={() => updatePlateFields(plate.key, { printer: pp.nama, printerProfileId: pp.id })}
                    className="h-8 px-3 rounded-[5px] text-xs font-medium transition-all"
                    style={plate.printerProfileId === pp.id
                      ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
                      : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t2)" }}
                    title={`Rp ${Math.round(pp.mesinPerJam).toLocaleString("id-ID")}/jam${pp.isPricingReference ? " · acuan harga" : ""}`}
                  >
                    {pp.nama.replace("Bambu Lab ", "").replace("Snapmaker ", "")}{pp.isPricingReference ? " 🎯" : ""}
                  </button>
                ))}
              </div>
              {plate.printerProfileId && printerProfiles && !printerProfiles.some(pp => pp.id === plate.printerProfileId) && (
                <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 rounded-[5px] text-[10px]"
                     style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}>
                  ⚠️ Profil printer &quot;{plate.printer ?? plate.printerProfileId}&quot; sudah dihapus — perhitungan jatuh ke rate global.
                  <button onClick={() => updatePlateFields(plate.key, { printer: undefined, printerProfileId: undefined })}
                          className="underline">bersihkan</button>
                </div>
              )}
            </div>

          </div>
        )
      })}

      {/* Total row (multi-plate only) */}
      {multiPlate && (
        <div className="flex items-center gap-4 px-1"
             style={{ borderTop: "1px solid var(--g-card-border)", paddingTop: 8 }}>
          <span className="text-xs font-semibold g-accent">
            TOTAL · {plates.length} parts
          </span>
          <span className="flex-1" />
          <span className="text-sm font-bold" style={{ color: "#a5b4fc" }}>
            {totalGramasi.toFixed(1)}g
          </span>
          <span className="text-sm font-bold" style={{ color: "#a5b4fc" }}>
            {formatDurasiDisplay(totalDurasi)}
          </span>
        </div>
      )}
      {multiPlate && (batch ?? 1) > 1 && totalGramasi > 0 && (
        <div className="flex items-center gap-4 px-1">
          <span className="text-[11px] g-t4">per pcs · ÷ batch {batch}</span>
          <span className="flex-1" />
          <span className="text-xs font-semibold g-t2">
            {(totalGramasi / batch!).toFixed(1)}g
          </span>
          <span className="text-xs font-semibold g-t2">
            {formatDurasiDisplay(totalDurasi / batch!)}
          </span>
        </div>
      )}

      {/* Add plate button */}
      <button
        onClick={addPlate}
        className="text-sm font-medium transition-colors"
        style={{ color: "rgba(99,102,241,0.7)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(99,102,241,0.7)")}
      >
        + Tambah Part
      </button>

      {zoomedThumbnail && (
        <ImageZoomModal
          src={zoomedThumbnail.src}
          alt={zoomedThumbnail.alt}
          onClose={() => setZoomedThumbnail(null)}
        />
      )}
    </div>
  )
}
