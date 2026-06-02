"use client"

import { useState, useEffect, useMemo } from "react"
import { useSpools, useCatalog } from "@/lib/hooks/use-filamen"
import {
  useFilamentAliases,
  useUpdateFilamentAliases,
  useRenameBrandOrMaterial,
} from "@/lib/hooks/use-filamen"

interface AliasRow {
  alias: string
  canonical: string
}

export function FilamentAliasCard() {
  const { data: aliasData, isLoading: aliasLoading } = useFilamentAliases()
  const updateAliases = useUpdateFilamentAliases()
  const renameMutation = useRenameBrandOrMaterial()
  const { data: spoolData } = useSpools()
  const { data: catalogData } = useCatalog()
  const catalog = catalogData?.catalog ?? {}

  const [rows, setRows] = useState<AliasRow[]>([])
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Rename / merge state
  const [renameField, setRenameField] = useState<"brand" | "material" | "color">("brand")
  const [renameFrom, setRenameFrom] = useState("")
  const [renameTo, setRenameTo] = useState("")
  const [renameBrandScope, setRenameBrandScope] = useState("")  // only for material/color
  const [renameSuccess, setRenameSuccess] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)

  // Populate rows from fetched aliases
  useEffect(() => {
    if (aliasData) {
      setRows(
        Object.entries(aliasData).map(([alias, canonical]) => ({ alias, canonical }))
      )
    }
  }, [aliasData])

  const allBrands = [...new Set(spoolData?.spools.map((s) => s.brand) ?? [])].sort()
  const allMaterials = [...new Set(
    (spoolData?.spools ?? [])
      .filter(s => !renameBrandScope || s.brand === renameBrandScope)
      .map(s => s.material)
  )].sort()
  const allColors = [...new Set(
    (spoolData?.spools ?? [])
      .filter(s => !renameBrandScope || s.brand === renameBrandScope)
      .map(s => s.colorName)
  )].sort()
  const fromOptions = renameField === "brand" ? allBrands
    : renameField === "material" ? allMaterials
    : allColors

  // "To" options for color: spool colors (in stock) + Spoolman catalog colors
  const catalogColorsForScope = useMemo(() => {
    if (renameField !== "color") return []
    const result = new Set<string>()
    // Get all materials matching the scope
    const brandsToCheck = renameBrandScope ? [renameBrandScope] : Object.keys(catalog)
    for (const b of brandsToCheck) {
      const materials = Object.keys(catalog[b] ?? {})
      for (const m of materials) {
        for (const c of (catalog[b][m] ?? [])) {
          result.add(c.colorName)
        }
      }
    }
    return [...result].sort()
  }, [renameField, renameBrandScope, catalog])

  // Combined "to" options: spool colors first, then catalog-only colors
  const toOptions = useMemo(() => {
    if (renameField !== "color") return fromOptions
    const spoolSet = new Set(allColors)
    const catalogOnly = catalogColorsForScope.filter(c => !spoolSet.has(c))
    return { inStock: allColors, catalogOnly }
  }, [renameField, allColors, catalogColorsForScope, fromOptions])

  function addRow() {
    setRows((prev) => [...prev, { alias: "", canonical: "" }])
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateRow(i: number, field: "alias" | "canonical", value: string) {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))
  }

  async function handleSave() {
    setSaveSuccess(false)
    setSaveError(null)
    const aliases: Record<string, string> = {}
    for (const row of rows) {
      if (row.alias.trim() && row.canonical.trim()) {
        aliases[row.alias.trim()] = row.canonical.trim()
      }
    }
    try {
      await updateAliases.mutateAsync(aliases)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Gagal menyimpan")
    }
  }

  async function handleRename() {
    setRenameSuccess(null)
    setRenameError(null)
    if (!renameFrom || !renameTo) {
      setRenameError("Pilih from dan isi to")
      return
    }
    try {
      const result = (await renameMutation.mutateAsync({
        field: renameField,
        from: renameFrom,
        to: renameTo,
        brandScope: (renameField !== 'brand' && renameBrandScope) ? renameBrandScope : undefined,
      })) as { updated?: number; error?: string }
      if (result.error) throw new Error(result.error)
      setRenameSuccess(`${result.updated ?? 0} spool diperbarui`)
      setRenameFrom("")
      setRenameTo("")
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Gagal merge")
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--g-card)",
    border: "1px solid var(--g-card-border)",
    borderRadius: "0.75rem",
    padding: "1.25rem",
  }
  const innerStyle: React.CSSProperties = {
    background: "var(--g-inner)",
    border: "1px solid var(--g-inner-border)",
    borderRadius: "0.5rem",
    padding: "0.75rem",
  }

  return (
    <div style={cardStyle} className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold g-t1">🔀 Filamen Alias &amp; Merge</span>
      </div>

      {/* ── Alias table ── */}
      <div>
        <p className="text-xs g-t3 mb-2">
          Daftar alias brand yang dipetakan ke nama kanonik. Digunakan saat impor data luar.
        </p>
        {aliasLoading ? (
          <div className="text-xs g-t3">Memuat alias...</div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.alias}
                  onChange={(e) => updateRow(i, "alias", e.target.value)}
                  placeholder="Alias (cth: BambuLab)"
                  className="glass-input text-xs px-2 py-1.5 rounded-md flex-1"
                />
                <span className="text-xs g-t4">→</span>
                <input
                  value={row.canonical}
                  onChange={(e) => updateRow(i, "canonical", e.target.value)}
                  placeholder="Nama kanonik (cth: Bambu Lab)"
                  className="glass-input text-xs px-2 py-1.5 rounded-md flex-1"
                />
                <button
                  onClick={() => removeRow(i)}
                  className="text-xs g-t4 hover:text-red-500 transition-colors px-1"
                  title="Hapus"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3 items-center flex-wrap">
          <button
            onClick={addRow}
            className="text-xs px-2.5 py-1 rounded-md transition-colors"
            style={{
              background: "var(--g-inner)",
              border: "1px solid var(--g-inner-border)",
              color: "var(--g-t3)",
            }}
          >
            + Tambah Alias
          </button>
          <button
            onClick={handleSave}
            disabled={updateAliases.isPending}
            className="text-xs px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
          >
            {updateAliases.isPending ? "Menyimpan..." : "Simpan"}
          </button>
          {saveSuccess && <span className="text-xs text-green-500">✓ Tersimpan</span>}
          {saveError && <span className="text-xs text-red-500">{saveError}</span>}
        </div>
      </div>

      {/* ── Merge / rename section ── */}
      <div style={innerStyle} className="space-y-3">
        <div className="text-xs font-semibold g-t2">🔀 Merge Brand / Material</div>
        <p className="text-xs g-t3">
          Ganti semua spool yang memiliki nama tertentu ke nama baru. Berguna untuk menyatukan brand yang duplikat.
        </p>

        {/* Field selector */}
        <div className="flex gap-2 flex-wrap">
          {(["brand", "material", "color"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setRenameField(f); setRenameFrom(""); setRenameTo(""); setRenameBrandScope("") }}
              className="text-xs px-2.5 py-1 rounded-full transition-all capitalize"
              style={
                renameField === f
                  ? {
                      background: "rgba(99,102,241,0.2)",
                      border: "1px solid rgba(99,102,241,0.4)",
                      color: "#a5b4fc",
                    }
                  : {
                      background: "var(--g-inner)",
                      border: "1px solid var(--g-inner-border)",
                      color: "var(--g-t3)",
                    }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Brand scope — only for material and color */}
        {renameField !== "brand" && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] g-t4 uppercase tracking-wide">
              Scope Brand <span className="normal-case g-t5">(opsional — kosong = semua brand)</span>
            </label>
            <select
              value={renameBrandScope}
              onChange={e => { setRenameBrandScope(e.target.value); setRenameFrom(""); setRenameTo("") }}
              className="glass-input text-xs px-2 py-1.5 rounded-md min-w-[160px]"
            >
              <option value="">— Semua brand —</option>
              {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] g-t4 uppercase tracking-wide">Dari</label>
            <select
              value={renameFrom}
              onChange={(e) => setRenameFrom(e.target.value)}
              className="glass-input text-xs px-2 py-1.5 rounded-md min-w-[140px]"
            >
              <option value="">-- pilih --</option>
              {fromOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs g-t4 mt-4">→</span>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] g-t4 uppercase tracking-wide">Ke (nama baru)</label>
            <select
              value="__custom__"
              onChange={e => { if (e.target.value !== "__custom__") setRenameTo(e.target.value) }}
              className="glass-input text-xs px-2 py-1.5 rounded-md min-w-[160px]"
            >
              <option value="__custom__">— Pilih atau ketik —</option>
              {renameField === "color" ? (
                <>
                  {(toOptions as { inStock: string[]; catalogOnly: string[] }).inStock
                    .filter(o => o !== renameFrom)
                    .map(o => <option key={`s-${o}`} value={o}>● {o}</option>)
                  }
                  {(toOptions as { inStock: string[]; catalogOnly: string[] }).catalogOnly
                    .filter(o => o !== renameFrom)
                    .map(o => <option key={`c-${o}`} value={o}>○ {o} (Spoolman)</option>)
                  }
                </>
              ) : (
                (toOptions as string[]).filter(o => o !== renameFrom).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))
              )}
            </select>
            <input
              type="text"
              value={renameTo}
              onChange={e => setRenameTo(e.target.value)}
              placeholder={`Nama ${renameField} baru (● stok, ○ Spoolman)`}
              className="glass-input text-xs px-2 py-1.5 rounded-md"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleRename}
            disabled={renameMutation.isPending || !renameFrom || !renameTo}
            className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
          >
            {renameMutation.isPending ? "Memproses..." : "Apply Rename"}
          </button>
          {renameSuccess && (
            <span className="text-xs text-green-500">✓ {renameSuccess}</span>
          )}
          {renameError && (
            <span className="text-xs text-red-500">✗ {renameError}</span>
          )}
        </div>
      </div>
    </div>
  )
}
