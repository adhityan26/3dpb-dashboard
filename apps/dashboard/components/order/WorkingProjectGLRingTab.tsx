'use client'
import { Fragment, useMemo, useState } from 'react'
import { useWorkingProjects, useUpdateWorkingProject, useSetChecklistByLabel, useGLRingProductIds, useGLRingBaseBoreMm, useShippingTableGroups, type WorkingProject } from '@/lib/hooks/use-working-projects'
import { splitProductVariants, variantShort, parseSizeFromVariantField, isGLRing, resolveVariantEntrySize } from '@/lib/working-projects/format'
import { resolveShippingTableGroup, DEFAULT_SHIPPING_TABLE_GROUPS, GENERAL_TABLE_TITLE, type ShippingTableGroup } from '@/lib/working-projects/shipping-schedule'
import { computeScale } from '@/lib/ring-resizer/sizing'
import { WorkingProjectEditModal } from './WorkingProjectEditModal'
import { downloadRowsAsXlsx } from '@/lib/export/xlsx'
import { WorkingProjectInvoiceButton } from './WorkingProjectInvoiceButton'
import { InlineEditCell, WorkingProjectStatusSelect, useInlineWorkingProjectUpdate } from './WorkingProjectInline'

// Same 0.3mm clearance the Ring Resizer's production form defaults to
// ("+ 0.3 mm kelonggaran (rekomendasi)") — this tab has no per-row toggle
// for it, so it always assumes the recommended default.
const CLEARANCE_MM = 0.3

// Uses scaleCeil (rounded UP to the whole percent), matching the Ring
// Resizer production form's own "bulatkan ke atas" convention — this is the
// scale factor production actually applies, not the exact/unrounded value.
function scalePctFor(usSize: string | null, baseBoreMm: number | null): number | null {
  if (!usSize || baseBoreMm == null) return null
  const value = Number(usSize)
  if (Number.isNaN(value) || value <= 0) return null
  return Math.round(computeScale({ mode: 'us', value, clearanceMm: CLEARANCE_MM, baseBoreMm }).scaleCeil * 100)
}

const PAGE_SIZES = [10, 25, 50, 100] as const

// Sentinel value of the Ukuran filter for rows with no resolvable size.
const NO_SIZE_FILTER = '__tanpa-ukuran__'

const ALL_STATUSES = ['Open', 'Proses', 'Waiting Customer', 'Siap Kirim', 'Done', 'Canceled'] as const
const DEFAULT_HIDDEN_STATUSES = new Set(['Done', 'Canceled'])

const STEP_TYPES = ['Print Frame', 'Print Stone', 'Print Ring', 'Cat Frame', 'Cat Stone', 'Cat Ring', 'Assembly'] as const
type StepType = (typeof STEP_TYPES)[number]
const PRINT_STEPS: StepType[] = ['Print Frame', 'Print Stone', 'Print Ring']
const CAT_STEPS: StepType[] = ['Cat Frame', 'Cat Stone', 'Cat Ring']

type SortColumn = 'dueDate' | 'orderDate' | 'orderNo' | 'platform' | 'variant' | 'usSize' | 'status'
type SortDir = 'asc' | 'desc'
interface SortKey { col: SortColumn; dir: SortDir }

interface RingRow {
  wpId: string
  key: string
  entry: string
  customer: string
  platform: string | null
  orderNo: string
  dueDate: string | null
  orderDate: string | null
  status: string
  shipping: string | null
  usSize: string | null
  // Size the marketplace variant field says, set only when the notes name a
  // DIFFERENT size (customer changed it via chat) — drives the ⚠ marker.
  variantUsSize: string | null
  scalePct: number | null
  discordThreadUrl: string | null
  checklistLabels: string[]
  checklistDone: Record<StepType, boolean>
}

function checklistLabelsFor(key: string, single: boolean): string[] {
  return STEP_TYPES.map(step => (single ? step : `${key} — ${step}`))
}

// Exported as its own row-shaping function so it's unit-testable without a
// browser download API (see lib/export/xlsx.ts).
export function glRingRowsToExportRows(rows: RingRow[]): Record<string, unknown>[] {
  return rows.map(r => {
    const doneCount = STEP_TYPES.filter(s => r.checklistDone[s]).length
    const stepCols = Object.fromEntries(STEP_TYPES.map(s => [s, r.checklistDone[s] ? '✅' : '']))
    return {
      'Due Date': r.dueDate ? new Date(r.dueDate).toLocaleDateString('id-ID') : '',
      'Order Date': r.orderDate ? new Date(r.orderDate).toLocaleDateString('id-ID') : '',
      'No Order': r.orderNo,
      Customer: r.customer,
      Platform: r.platform ?? '',
      Variant: r.key,
      Ukuran: r.usSize ? `US ${r.usSize}` : '',
      'Ukuran Variant (beda)': r.variantUsSize ? `US ${r.variantUsSize}` : '',
      Scale: r.scalePct ? `${r.scalePct}%` : '',
      ...stepCols,
      Progress: `${doneCount}/${STEP_TYPES.length}`,
      Status: r.status,
      Kurir: r.shipping ?? '',
      Discord: r.discordThreadUrl ?? '',
    }
  })
}

function expandToRows(projects: WorkingProject[], configuredProductIds: string[], baseBoreMm: number | null): RingRow[] {
  const rows: RingRow[] = []
  for (const wp of projects) {
    if (!isGLRing(wp.appliedTags ?? [], wp.forumChannelId, wp.product, wp.sourceProductId, configuredProductIds)) continue
    const variants = splitProductVariants(wp.product)
    const single = variants.length <= 1
    variants.forEach((entry) => {
      const key = variantShort(entry)
      // Notes win over the marketplace `variant` field / the entry's own
      // embedded size: notes are where the admin records a size the customer
      // changed after ordering, so they are the newer information. See
      // resolveVariantEntrySize's own doc for the full precedence.
      // When notes and the variant field name different sizes, the variant
      // size is kept in `variantUsSize` so the UI can flag the discrepancy.
      const fromVariantField = single ? parseSizeFromVariantField(wp.variant ?? '') : { usSize: null }
      const { usSize } = resolveVariantEntrySize({ entry, key, notes: wp.notes ?? null, variant: wp.variant ?? null, variantCount: variants.length })
      const variantUsSize =
        usSize && fromVariantField.usSize && Number(usSize) !== Number(fromVariantField.usSize)
          ? fromVariantField.usSize
          : null
      const scalePct = scalePctFor(usSize, baseBoreMm)
      const labels = checklistLabelsFor(key, single)
      const checklistDone = {} as Record<StepType, boolean>
      STEP_TYPES.forEach((step, i) => {
        const label = labels[i]
        const item = (wp.checklist ?? []).find(
          c => !c.deleted && c.text.toLowerCase().includes(label.toLowerCase()),
        )
        checklistDone[step] = item?.done ?? false
      })
      rows.push({
        wpId: wp.id,
        key,
        entry,
        customer: wp.customer,
        platform: wp.platform,
        orderNo: wp.sourceOrderNo ?? wp.orderNoLegacy ?? '-',
        dueDate: wp.dueDate,
        orderDate: wp.orderDate ?? null,
        status: wp.status,
        shipping: wp.shipping ?? null,
        usSize,
        variantUsSize,
        scalePct,
        discordThreadUrl: wp.discordThreadUrl ?? null,
        checklistLabels: labels,
        checklistDone,
      })
    })
  }
  return rows
}

// Numeric-aware compare — e.g. ring sizes ("7", "11") used to sort as
// strings, putting "11" before "7" ("11" < "7" lexically). Falls back to
// locale string compare for non-numeric columns (dueDate/orderDate's ISO
// strings still sort correctly that way) and keeps null/empty ('') first,
// matching the previous String(v ?? '') behavior.
function compareRows(a: RingRow, b: RingRow, col: SortColumn): number {
  const va = valueFor(a, col)
  const vb = valueFor(b, col)
  const sa = va == null ? '' : String(va)
  const sb = vb == null ? '' : String(vb)
  const na = sa.trim() === '' ? NaN : Number(sa)
  const nb = sb.trim() === '' ? NaN : Number(sb)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return sa.localeCompare(sb, 'id', { numeric: true })
}

function valueFor(r: RingRow, col: SortColumn): string | number | null {
  switch (col) {
    case 'dueDate': return r.dueDate
    case 'orderDate': return r.orderDate
    case 'orderNo': return r.orderNo
    case 'platform': return r.platform
    case 'variant': return r.key
    case 'usSize': return r.usSize
    case 'status': return r.status
  }
}

const COLUMN_LABELS: Record<SortColumn, string> = {
  dueDate: 'Due Date',
  orderDate: 'Order Date',
  orderNo: 'No Order',
  platform: 'Platform',
  variant: 'Variant',
  usSize: 'Ukuran',
  status: 'Status',
}

// Column display order per spec: Due Date, Order Date, No Order, Platform,
// Variant, Ukuran, Scale, [7 checklist checkboxes], Progress, Status, Discord.
// `status` is sortable but its *display* position is near the end, so it is
// rendered separately from the leading sortable-header block below.
const LEADING_SORT_COLUMNS: SortColumn[] = ['dueDate', 'orderDate', 'orderNo', 'platform', 'variant', 'usSize']

export function WorkingProjectGLRingTab() {
  const { data, isLoading } = useWorkingProjects()
  const updateMutation = useUpdateWorkingProject()
  const inline = useInlineWorkingProjectUpdate()
  const [editing, setEditing] = useState<WorkingProject | null>(null)
  const [sortKeys, setSortKeys] = useState<SortKey[]>([{ col: 'dueDate', dir: 'asc' }])
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('')
  const [variant, setVariant] = useState('')
  const [size, setSize] = useState('')
  const [dueDateFrom, setDueDateFrom] = useState('')
  const [dueDateTo, setDueDateTo] = useState('')
  const [step, setStep] = useState<StepType | ''>('')
  const [stepStatus, setStepStatus] = useState<'' | 'done' | 'not-done'>('')
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set(ALL_STATUSES.filter(s => !DEFAULT_HIDDEN_STATUSES.has(s))),
  )
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25)
  const [page, setPage] = useState(1)

  // Local optimistic overrides applied on top of server data, keyed by
  // `${wpId}::${label}`, so a checkbox flips immediately while the mutation
  // is in flight. A successful mutation invalidates the shared
  // WORKING_PROJECTS_KEY query cache (via useSetChecklistByLabel) so a
  // refetch brings in server (and Discord-echoed) truth; the override is
  // kept meanwhile purely to avoid a flash back to the pre-toggle state.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const setChecklistByLabel = useSetChecklistByLabel()
  const { data: configuredProductIds } = useGLRingProductIds()
  const { data: baseBoreMm } = useGLRingBaseBoreMm()
  const { data: tableGroupsData } = useShippingTableGroups()
  const tableGroups = tableGroupsData ?? DEFAULT_SHIPPING_TABLE_GROUPS
  const [summaryOpen, setSummaryOpen] = useState(false)

  const allRows = useMemo(
    () => expandToRows(data ?? [], configuredProductIds ?? [], baseBoreMm),
    [data, configuredProductIds, baseBoreMm],
  )

  const rowsWithOverrides = useMemo(() => {
    return allRows.map(r => {
      const checklistDone = { ...r.checklistDone }
      r.checklistLabels.forEach((label, i) => {
        const overrideKey = `${r.wpId}::${label}`
        if (overrideKey in overrides) checklistDone[STEP_TYPES[i]] = overrides[overrideKey]
      })
      return { ...r, checklistDone }
    })
  }, [allRows, overrides])

  const platformOptions = useMemo(
    () => Array.from(new Set(allRows.map(r => r.platform).filter((p): p is string => !!p))).sort(),
    [allRows],
  )
  const variantOptions = useMemo(
    () => Array.from(new Set(allRows.map(r => r.key))).sort(),
    [allRows],
  )
  const sizeOptions = useMemo(
    // Numeric order (2, 3, 5 ... 10, 10.5, 21), not the default string sort that put "10" before "2".
    () => Array.from(new Set(allRows.map(r => r.usSize).filter((s): s is string => !!s))).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    [allRows],
  )

  const rows = useMemo(() => {
    let out = rowsWithOverrides
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r => r.orderNo.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q))
    }
    if (platform) out = out.filter(r => r.platform === platform)
    if (variant) out = out.filter(r => r.key === variant)
    if (size === NO_SIZE_FILTER) out = out.filter(r => !r.usSize)
    else if (size) out = out.filter(r => r.usSize === size)
    if (dueDateFrom) out = out.filter(r => r.dueDate && r.dueDate.slice(0, 10) >= dueDateFrom)
    if (dueDateTo) out = out.filter(r => r.dueDate && r.dueDate.slice(0, 10) <= dueDateTo)
    out = out.filter(r => statusFilter.has(r.status))
    if (step && stepStatus) {
      out = out.filter(r => {
        const done = r.checklistDone[step]
        return stepStatus === 'done' ? done : !done
      })
    }
    const sorted = [...out].sort((a, b) => {
      for (const key of sortKeys) {
        const cmp = compareRows(a, b, key.col)
        if (cmp !== 0) return key.dir === 'desc' ? -cmp : cmp
      }
      return 0
    })
    return sorted
  }, [rowsWithOverrides, search, platform, variant, size, dueDateFrom, dueDateTo, statusFilter, step, stepStatus, sortKeys])

  function toggleStatus(status: string) {
    setPage(1)
    setStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Cycles a column asc -> desc -> removed. Shift+click adds/cycles the
  // column within the existing multi-sort list (up to 3 keys); a plain
  // click collapses to just this column, still cycling its own direction
  // if it was already the (sole) active sort.
  function handleHeaderClick(col: SortColumn, e: React.MouseEvent) {
    setPage(1)
    setSortKeys(prev => {
      const existingDir = prev.find(k => k.col === col)?.dir
      const nextDir: SortDir | null = existingDir === undefined ? 'asc' : existingDir === 'asc' ? 'desc' : null
      if (e.shiftKey) {
        const withoutCol = prev.filter(k => k.col !== col)
        if (nextDir === null) return withoutCol
        return [...withoutCol, { col, dir: nextDir }].slice(-3)
      }
      return nextDir === null ? [] : [{ col, dir: nextDir }]
    })
  }

  async function toggleChecklist(row: RingRow, stepType: StepType, label: string) {
    const nextDone = !row.checklistDone[stepType]
    setChecklistError(null)
    setOverrides(prev => ({ ...prev, [`${row.wpId}::${label}`]: nextDone }))
    try {
      await setChecklistByLabel.mutateAsync({ id: row.wpId, label, done: nextDone, by: 'dashboard' })
    } catch (err) {
      // request failed (network or non-2xx): revert the optimistic flip
      setOverrides(prev => ({ ...prev, [`${row.wpId}::${label}`]: !nextDone }))
      setChecklistError(`Gagal menyimpan checklist "${label}": ${(err as Error).message}`)
    }
  }

  if (isLoading) return <div className="py-12 text-center text-sm g-t4">Loading...</div>

  const activeCount = rows.length
  const missingSizeCount = rows.filter(r => !r.usSize).length
  const fullyDoneCount = rows.filter(r => STEP_TYPES.every(s => r.checklistDone[s])).length
  // Per-part progress within the currently filtered rows (respects the Due
  // Date range and every other active filter) — "berapa tiap part udah
  // dicetak/dicek dan assembly" summary. Grouped using the SAME
  // user-configured tables as the Jadwal Kirim tab (Settings > Working
  // Project), so e.g. "GL Ring 2026" and "GL Ring Cosplay" don't get lumped
  // together just because they're both rings — a product matching no
  // configured table falls into "General", same as Jadwal Kirim.
  const stepBreakdown = useMemo(() => {
    const tables = new Map<string, { title: string; rows: RingRow[] }>()
    for (const r of rows) {
      const group = resolveShippingTableGroup(r.key, tableGroups)
      const title = group?.title ?? GENERAL_TABLE_TITLE
      if (!tables.has(title)) tables.set(title, { title, rows: [] })
      tables.get(title)!.rows.push(r)
    }

    const tableRank = new Map(tableGroups.map((g: ShippingTableGroup, i: number) => [g.title, i]))

    return [...tables.values()]
      .sort((a, b) => (tableRank.get(a.title) ?? Infinity) - (tableRank.get(b.title) ?? Infinity))
      .map(table => {
        const subGroups = new Map<string, RingRow[]>()
        for (const r of table.rows) {
          const sizeLabel = r.usSize ? `US ${r.usSize}` : 'Tanpa Ukuran'
          // One table = one product, so rows are distinct by size only.
          const label = sizeLabel
          if (!subGroups.has(label)) subGroups.set(label, [])
          subGroups.get(label)!.push(r)
        }
        const subRows = [...subGroups.entries()]
          .sort(([a], [b]) => {
            const aEmpty = a === 'Tanpa Ukuran'
            const bEmpty = b === 'Tanpa Ukuran'
            if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
            return a.localeCompare(b, 'id', { numeric: true })
          })
          .map(([label, subRowsForLabel]) => {
            // delta = done - total: negative means that many pieces still
            // need to be printed/dicek for this step, 0 means already pas.
            const steps = STEP_TYPES.map(s => {
              const done = subRowsForLabel.filter(r => r.checklistDone[s]).length
              return { step: s, done, delta: done - subRowsForLabel.length }
            })
            return {
              label,
              total: subRowsForLabel.length,
              steps,
              // Flags for the Total column — "sudah cetak semua" / "sudah cat
              // semua" without needing to read the individual step counts.
              printDone: PRINT_STEPS.every(s => steps.find(st => st.step === s)!.delta === 0),
              catDone: CAT_STEPS.every(s => steps.find(st => st.step === s)!.delta === 0),
            }
          })
        return { title: table.title, subRows }
      })
  }, [rows, tableGroups])

  const selectClass = 'glass-input h-9 rounded-[5px] px-2 text-sm'
  const thBase = 'px-3 py-2 text-left font-semibold whitespace-nowrap g-t4'
  const tdBase = 'px-3 py-2 text-sm whitespace-nowrap'

  function sortIndicator(col: SortColumn) {
    const idx = sortKeys.findIndex(k => k.col === col)
    if (idx === -1) return <span className="opacity-50"> ↕</span>
    const arrow = sortKeys[idx].dir === 'asc' ? '▲' : '▼'
    return <span className="g-accent"> {arrow}{sortKeys.length > 1 ? <sup>{idx + 1}</sup> : null}</span>
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center mb-3 text-xs">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full g-t2" style={{ background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}>
          Aktif: <b className="g-t1">{activeCount}</b>
        </span>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${missingSizeCount > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'g-t2'}`} style={missingSizeCount > 0 ? undefined : { background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}>
          Tanpa Ukuran: <b>{missingSizeCount}</b>
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
          Selesai Semua: <b>{fullyDoneCount}</b>
        </span>
        <span className="g-t4 ml-auto hidden sm:inline">Shift+klik header untuk multi-sort (maks 3)</span>
      </div>

      {stepBreakdown.length > 0 && (
        <div className="mb-3 rounded-[5px]" style={{ border: '1px solid var(--g-card-border)' }}>
          <button
            type="button"
            onClick={() => setSummaryOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs g-t4 hover:g-t2"
          >
            <span>
              📊 Progress per Ukuran{dueDateFrom || dueDateTo ? ` (${dueDateFrom || '...'} s/d ${dueDateTo || '...'})` : ''}
            </span>
            <span>{summaryOpen ? '▲ Sembunyikan' : '▼ Tampilkan'}</span>
          </button>
          {summaryOpen && (
            <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--g-card-border)' }}>
              <table className="min-w-full border-collapse text-xs">
                <thead className="uppercase" style={{ background: 'var(--g-card)' }}>
                  <tr>
                    <th className={`${thBase} text-center`}>Total</th>
                    <th className={thBase}>Ukuran</th>
                    {STEP_TYPES.map(s => <th key={s} className={`${thBase} text-center`}>{s}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {stepBreakdown.map(table => (
                    <Fragment key={table.title}>
                      <tr className="border-b dark:border-white/5 border-black/5" style={{ background: 'var(--g-card)' }}>
                        <td colSpan={STEP_TYPES.length + 2} className="px-3 py-1.5 text-xs font-semibold g-t2">{table.title}</td>
                      </tr>
                      {table.subRows.map(sub => (
                        <tr key={sub.label} className="border-b dark:border-white/5 border-black/5">
                          <td className={`${tdBase} text-center`}>
                            <div className="flex items-center justify-center gap-1.5">
                              <b className="g-t1">{sub.total}</b>
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${sub.printDone ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'g-t4'}`}
                                style={sub.printDone ? undefined : { background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}
                                title={sub.printDone ? 'Semua sudah dicetak' : 'Masih ada yang belum dicetak'}
                              >
                                🖨️ {sub.printDone ? 'Sudah' : 'Belum'}
                              </span>
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${sub.catDone ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'g-t4'}`}
                                style={sub.catDone ? undefined : { background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}
                                title={sub.catDone ? 'Semua sudah dicat' : 'Masih ada yang belum dicat'}
                              >
                                🎨 {sub.catDone ? 'Sudah' : 'Belum'}
                              </span>
                            </div>
                          </td>
                          <td className={tdBase}>{sub.label}</td>
                          {sub.steps.map(({ step: s, done, delta }) => (
                            <td key={s} className={`${tdBase} text-center`}>
                              <div className="flex items-center justify-center gap-1.5">
                                <span>{done}/{sub.total}</span>
                                {delta === 0 ? (
                                  <span
                                    className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                    title="Sudah pas, tidak ada kekurangan"
                                  >
                                    ✓ Pas
                                  </span>
                                ) : (
                                  <span
                                    className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                    title={`Masih kurang ${-delta} lagi`}
                                  >
                                    {delta}
                                  </span>
                                )}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {inline.error && (
        <div role="alert" className="mb-3 px-3 py-2 rounded-[5px] text-sm bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {inline.error}
        </div>
      )}

      {checklistError && (
        <div role="alert" className="mb-3 px-3 py-2 rounded-[5px] text-sm bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {checklistError}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          type="text"
          placeholder="🔍 Cari order no / customer..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="glass-input flex-1 min-w-[160px] h-9 rounded-[5px] px-3 text-sm"
        />
        <select aria-label="Platform" value={platform} onChange={e => { setPlatform(e.target.value); setPage(1) }} className={selectClass}>
          <option value="">Semua Platform</option>
          {platformOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusMenuOpen(v => !v)}
            className={selectClass}
          >
            Status: {statusFilter.size} dipilih ▾
          </button>
          {statusMenuOpen ? (
            <div
              className="absolute top-full left-0 mt-1 z-10 min-w-[180px] rounded-[5px] p-2"
              style={{ background: 'var(--g-modal)', border: '1px solid var(--g-card-border)' }}
            >
              {ALL_STATUSES.map(s => (
                <label key={s} className="flex items-center gap-2 px-1.5 py-1 rounded-[4px] hover:bg-white/5 text-sm cursor-pointer">
                  <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} />
                  {s}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <select aria-label="Variant" value={variant} onChange={e => { setVariant(e.target.value); setPage(1) }} className={selectClass}>
          <option value="">Semua Variant</option>
          {variantOptions.map(v => <option key={v} value={v}>{`Variant: ${v}`}</option>)}
        </select>
        <select aria-label="Ukuran" value={size} onChange={e => { setSize(e.target.value); setPage(1) }} className={selectClass}>
          <option value="">Semua Ukuran</option>
          <option value={NO_SIZE_FILTER}>Tanpa Ukuran</option>
          {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs g-t4">
          Due
          <input
            type="date"
            aria-label="Due Date dari"
            value={dueDateFrom}
            onChange={e => { setDueDateFrom(e.target.value); setPage(1) }}
            className={`${selectClass} px-2`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs g-t4">
          s/d
          <input
            type="date"
            aria-label="Due Date sampai"
            value={dueDateTo}
            onChange={e => { setDueDateTo(e.target.value); setPage(1) }}
            className={`${selectClass} px-2`}
          />
        </label>
        <select aria-label="Tahap Produksi" value={step} onChange={e => { setStep(e.target.value as StepType | ''); setPage(1) }} className={selectClass}>
          <option value="">Semua Tahap</option>
          {STEP_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Status Tahap" value={stepStatus} onChange={e => { setStepStatus(e.target.value as '' | 'done' | 'not-done'); setPage(1) }} className={selectClass}>
          <option value="">Status Tahap: Semua</option>
          <option value="done">Tahap: Selesai</option>
          <option value="not-done">Tahap: Belum</option>
        </select>
        <select
          aria-label="Ukuran Halaman"
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]); setPage(1) }}
          className={selectClass}
        >
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / halaman</option>)}
        </select>
        <button
          type="button"
          onClick={() => downloadRowsAsXlsx(
            `working-projects-gl-ring-${new Date().toISOString().slice(0, 10)}.xlsx`,
            'GL Ring',
            glRingRowsToExportRows(rows),
          )}
          disabled={rows.length === 0}
          className={`${selectClass} disabled:opacity-50`}
          title="Export baris yang sedang difilter (semua halaman) ke Excel"
        >
          📊 Export Excel
        </button>
      </div>

      <div className="overflow-x-auto rounded-[5px]" style={{ border: '1px solid var(--g-card-border)' }}>
        <table className="min-w-full border-collapse">
          <thead className="text-xs uppercase" style={{ background: 'var(--g-card)' }}>
            <tr>
              {LEADING_SORT_COLUMNS.map(col => (
                <th key={col} onClick={e => handleHeaderClick(col, e)} className={`${thBase} cursor-pointer select-none hover:g-t1`}>
                  {COLUMN_LABELS[col]}{sortIndicator(col)}
                </th>
              ))}
              <th className={thBase}>Scale</th>
              {STEP_TYPES.map(s => (
                <th key={s} className={`${thBase} text-center leading-tight`} title={s}>
                  {s.split(' ').map((w, i) => <span key={i} className="block">{w}</span>)}
                </th>
              ))}
              <th className={`${thBase} text-center`}>Progress</th>
              <th onClick={e => handleHeaderClick('status', e)} className={`${thBase} cursor-pointer select-none hover:g-t1`}>
                {COLUMN_LABELS.status}{sortIndicator('status')}
              </th>
              <th className={thBase}>Kurir</th>
              <th className={thBase}>Discord</th>
              <th className={thBase}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={LEADING_SORT_COLUMNS.length + STEP_TYPES.length + 6} className="px-3 py-8 text-center text-sm g-t4">
                  Tidak ada baris yang cocok dengan filter.
                </td>
              </tr>
            ) : pageRows.map((r, i) => {
              const doneCount = STEP_TYPES.filter(s => r.checklistDone[s]).length
              return (
                <tr key={`${r.wpId}-${r.key}-${i}`} className="border-b dark:border-white/5 border-black/5 hover:bg-white/5 align-middle">
                  <td className={tdBase}>
                    <InlineEditCell
                      label="due date"
                      type="date"
                      value={r.dueDate ? r.dueDate.slice(0, 10) : ''}
                      display={r.dueDate ? new Date(r.dueDate).toLocaleDateString('id-ID') : '-'}
                      onSave={v => inline.save(r.wpId, { dueDateRaw: v }, 'due date')}
                    />
                  </td>
                  <td className={tdBase}>
                    <InlineEditCell
                      label="order date"
                      type="date"
                      value={r.orderDate ? r.orderDate.slice(0, 10) : ''}
                      display={r.orderDate ? new Date(r.orderDate).toLocaleDateString('id-ID') : '-'}
                      onSave={v => inline.save(r.wpId, { orderDateRaw: v }, 'order date')}
                    />
                  </td>
                  <td className={tdBase}>
                    <div className="font-medium">{r.orderNo}</div>
                    <div className="text-xs g-t4 truncate max-w-[160px]" title={r.customer}>{r.customer}</div>
                  </td>
                  <td className={tdBase}>{r.platform ?? '-'}</td>
                  <td className={`${tdBase} max-w-[200px]`}><div className="truncate" title={r.entry}>{r.key}</div></td>
                  <td className={tdBase}>
                    {r.usSize ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium g-accent" style={{ background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}>
                        US {r.usSize}
                        {r.variantUsSize ? (
                          <span
                            className="ml-1 text-amber-600 dark:text-amber-300"
                            title={`Ukuran di notes (US ${r.usSize}) berbeda dari variant marketplace (US ${r.variantUsSize}). Yang dipakai: notes.`}
                            aria-label={`Berbeda dari variant: US ${r.variantUsSize}`}
                          >
                            ⚠ variant: US {r.variantUsSize}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" title="Ukuran tidak ditemukan di notes">
                        -
                      </span>
                    )}
                  </td>
                  <td className={`${tdBase} g-t2`}>{r.scalePct ? `${r.scalePct}%` : '-'}</td>
                  {STEP_TYPES.map((s, si) => (
                    <td key={s} className={`${tdBase} text-center`}>
                      <input
                        type="checkbox"
                        checked={r.checklistDone[s]}
                        onChange={() => toggleChecklist(r, s, r.checklistLabels[si])}
                        aria-label={r.checklistLabels[si]}
                        title={r.checklistLabels[si]}
                        className="h-4 w-4 cursor-pointer accent-[var(--g-accent)]"
                      />
                    </td>
                  ))}
                  <td className={`${tdBase} text-center`}>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${doneCount === STEP_TYPES.length ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : doneCount > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'g-t4'}`} style={doneCount === 0 ? { background: 'var(--g-card)', border: '1px solid var(--g-card-border)' } : undefined}>
                      {doneCount}/{STEP_TYPES.length}
                    </span>
                  </td>
                  <td className={tdBase}>
                    <WorkingProjectStatusSelect
                      value={inline.statusOverride[r.wpId] ?? r.status}
                      onChange={st => inline.setStatus(r.wpId, st)}
                    />
                  </td>
                  <td className={tdBase}>
                    <InlineEditCell
                      label="kurir"
                      value={r.shipping ?? ''}
                      display={r.shipping ?? '-'}
                      onSave={v => inline.save(r.wpId, { shipping: v }, 'kurir')}
                    />
                  </td>
                  <td className={tdBase}>
                    {r.discordThreadUrl ? (
                      <a href={r.discordThreadUrl} target="_blank" rel="noreferrer" className="g-accent underline">Buka</a>
                    ) : '-'}
                  </td>
                  <td className={`${tdBase} space-x-2`}>
                    <button
                      type="button"
                      onClick={() => setEditing((data ?? []).find(w => w.id === r.wpId) ?? null)}
                      className="g-accent hover:opacity-80 text-base leading-none"
                      title="Edit"
                      aria-label={`Edit ${r.orderNo}`}
                    >
                      ✏️
                    </button>
                    {(() => {
                      const wp = (data ?? []).find(w => w.id === r.wpId)
                      return wp ? <WorkingProjectInvoiceButton wp={wp} /> : null
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-3 text-xs g-t4">
        <span>Menampilkan {rows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, rows.length)} dari {rows.length}</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="h-8 px-2 rounded-[5px] g-btn-ghost disabled:opacity-40">‹ Prev</button>
          <span className="px-2 py-1">{currentPage} / {totalPages}</span>
          <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-8 px-2 rounded-[5px] g-btn-ghost disabled:opacity-40">Next ›</button>
        </div>
      </div>

      <WorkingProjectEditModal
        project={editing}
        onClose={() => setEditing(null)}
        isPending={updateMutation.isPending}
        error={updateMutation.error instanceof Error ? updateMutation.error.message : null}
        onSave={({ id, patch }) => {
          updateMutation.mutate({ id, patch }, { onSuccess: () => setEditing(null) })
        }}
      />
    </>
  )
}
