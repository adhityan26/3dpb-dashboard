'use client'
import { useMemo, useState } from 'react'
import { useWorkingProjects, useSetChecklistByLabel, useGLRingProductIds, type WorkingProject } from '@/lib/hooks/use-working-projects'
import { splitProductVariants, variantShort, parseSize, isGLRing, notesSegmentForKey } from '@/lib/working-projects/format'

const PAGE_SIZES = [10, 25, 50, 100] as const

const STEP_TYPES = ['Print Frame', 'Print Stone', 'Print Ring', 'Cat Frame', 'Cat Stone', 'Cat Ring', 'Assembly'] as const
type StepType = (typeof STEP_TYPES)[number]

type SortColumn = 'dueDate' | 'orderDate' | 'orderNo' | 'platform' | 'variant' | 'usSize' | 'status'

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
  usSize: string | null
  scalePct: number | null
  discordThreadUrl: string | null
  checklistLabels: string[]
  checklistDone: Record<StepType, boolean>
}

function checklistLabelsFor(key: string, single: boolean): string[] {
  return STEP_TYPES.map(step => (single ? step : `${key} — ${step}`))
}

function expandToRows(projects: WorkingProject[], configuredProductIds: string[]): RingRow[] {
  const rows: RingRow[] = []
  for (const wp of projects) {
    if (wp.status === 'Canceled') continue
    if (!isGLRing(wp.appliedTags ?? [], wp.forumChannelId, wp.product, wp.sourceProductId, configuredProductIds)) continue
    const variants = splitProductVariants(wp.product)
    const single = variants.length <= 1
    variants.forEach((entry) => {
      const key = variantShort(entry)
      const segment = notesSegmentForKey(wp.notes ?? '', key, variants.length)
      const { usSize, scalePct } = parseSize(segment)
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
        usSize,
        scalePct,
        discordThreadUrl: wp.discordThreadUrl ?? null,
        checklistLabels: labels,
        checklistDone,
      })
    })
  }
  return rows
}

function compareRows(a: RingRow, b: RingRow, col: SortColumn): number {
  const va = valueFor(a, col)
  const vb = valueFor(b, col)
  return String(va ?? '').localeCompare(String(vb ?? ''))
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
  const [sortKeys, setSortKeys] = useState<SortColumn[]>(['dueDate'])
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('')
  const [variant, setVariant] = useState('')
  const [size, setSize] = useState('')
  const [step, setStep] = useState<StepType | ''>('')
  const [stepStatus, setStepStatus] = useState<'' | 'done' | 'not-done'>('')
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

  const allRows = useMemo(
    () => expandToRows(data ?? [], configuredProductIds ?? []),
    [data, configuredProductIds],
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
    () => Array.from(new Set(allRows.map(r => r.usSize).filter((s): s is string => !!s))).sort(),
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
    if (size) out = out.filter(r => r.usSize === size)
    if (step && stepStatus) {
      out = out.filter(r => {
        const done = r.checklistDone[step]
        return stepStatus === 'done' ? done : !done
      })
    }
    const sorted = [...out].sort((a, b) => {
      for (const key of sortKeys) {
        const cmp = compareRows(a, b, key)
        if (cmp !== 0) return cmp
      }
      return 0
    })
    return sorted
  }, [rowsWithOverrides, search, platform, variant, size, step, stepStatus, sortKeys])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function handleHeaderClick(col: SortColumn, e: React.MouseEvent) {
    setPage(1)
    setSortKeys(prev => {
      if (e.shiftKey) {
        const next = [...prev.filter(k => k !== col), col]
        return next.slice(-3)
      }
      return [col]
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

  if (isLoading) return <div>Loading...</div>

  const activeCount = rowsWithOverrides.length
  const missingSizeCount = rowsWithOverrides.filter(r => !r.usSize).length
  const fullyDoneCount = rowsWithOverrides.filter(r => STEP_TYPES.every(s => r.checklistDone[s])).length

  return (
    <div>
      <div>
        <span>Aktif: {activeCount}</span>
        <span>Tanpa Ukuran: {missingSizeCount}</span>
        <span>Selesai Semua: {fullyDoneCount}</span>
      </div>

      {checklistError && (
        <div role="alert" style={{ color: '#dc2626' }}>{checklistError}</div>
      )}

      <div>
        <input
          placeholder="Cari order no / customer..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label>
          Platform
          <select aria-label="Platform" value={platform} onChange={e => setPlatform(e.target.value)}>
            <option value="">Semua</option>
            {platformOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          Variant
          <select aria-label="Variant" value={variant} onChange={e => setVariant(e.target.value)}>
            <option value="">Semua</option>
            {variantOptions.map(v => <option key={v} value={v}>{`Variant: ${v}`}</option>)}
          </select>
        </label>
        <label>
          Ukuran
          <select aria-label="Ukuran" value={size} onChange={e => setSize(e.target.value)}>
            <option value="">Semua</option>
            {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Tahap Produksi
          <select aria-label="Tahap Produksi" value={step} onChange={e => setStep(e.target.value as StepType | '')}>
            <option value="">Semua</option>
            {STEP_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Status Tahap
          <select aria-label="Status Tahap" value={stepStatus} onChange={e => setStepStatus(e.target.value as '' | 'done' | 'not-done')}>
            <option value="">Semua</option>
            <option value="done">Selesai</option>
            <option value="not-done">Belum</option>
          </select>
        </label>
        <label>
          Ukuran Halaman
          <select
            aria-label="Ukuran Halaman"
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]); setPage(1) }}
          >
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / halaman</option>)}
          </select>
        </label>
      </div>

      <table>
        <thead>
          <tr>
            {LEADING_SORT_COLUMNS.map(col => (
              <th key={col} onClick={e => handleHeaderClick(col, e)} style={{ cursor: 'pointer' }}>
                {COLUMN_LABELS[col]}
                {sortKeys.includes(col) ? ` (${sortKeys.indexOf(col) + 1})` : ''}
              </th>
            ))}
            <th>Scale</th>
            {STEP_TYPES.map(s => <th key={s}>{s}</th>)}
            <th>Progress</th>
            <th onClick={e => handleHeaderClick('status', e)} style={{ cursor: 'pointer' }}>
              {COLUMN_LABELS.status}
              {sortKeys.includes('status') ? ` (${sortKeys.indexOf('status') + 1})` : ''}
            </th>
            <th>Discord</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r, i) => {
            const doneCount = STEP_TYPES.filter(s => r.checklistDone[s]).length
            return (
              <tr key={`${r.wpId}-${r.key}-${i}`}>
                <td>{r.dueDate ?? '-'}</td>
                <td>{r.orderDate ?? '-'}</td>
                <td>{r.orderNo}</td>
                <td>{r.platform ?? '-'}</td>
                <td>{r.key}</td>
                <td>{r.usSize ? `US ${r.usSize}` : '-'}</td>
                <td>{r.scalePct ? `${r.scalePct}%` : '-'}</td>
                {STEP_TYPES.map((s, si) => (
                  <td key={s}>
                    <input
                      type="checkbox"
                      checked={r.checklistDone[s]}
                      onChange={() => toggleChecklist(r, s, r.checklistLabels[si])}
                      aria-label={r.checklistLabels[si]}
                    />
                  </td>
                ))}
                <td>{doneCount}/7</td>
                <td>{r.status}</td>
                <td>
                  {r.discordThreadUrl ? (
                    <a href={r.discordThreadUrl} target="_blank" rel="noreferrer">Discord</a>
                  ) : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div>
        <span>Menampilkan {rows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, rows.length)} dari {rows.length}</span>
        <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>‹ Prev</button>
        <span>{currentPage} / {totalPages}</span>
        <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>Next ›</button>
      </div>
    </div>
  )
}
