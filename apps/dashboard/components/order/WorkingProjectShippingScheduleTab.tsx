'use client'
import { Fragment, useDeferredValue, useMemo, useState } from 'react'
import { useWorkingProjects, useGLRingProductIds, useCategoryProductIds, useFastCouriers, useShippingTableGroups } from '@/lib/hooks/use-working-projects'
import {
  buildShippingScheduleRows,
  buildPivotTables,
  dateRangeColumns,
  NO_DUE_DATE_COLUMN,
  DEFAULT_SHIPPING_TABLE_GROUPS,
  type ShippingScheduleRow,
  type ScheduleCategory,
} from '@/lib/working-projects/shipping-schedule'
import { DEFAULT_FAST_COURIERS } from '@/lib/working-projects/courier'
import type { CategoryProductIds } from '@/lib/working-projects/category'

const ALL_STATUSES = ['Open', 'Proses', 'Waiting Customer', 'Siap Kirim', 'Done', 'Canceled'] as const
const DEFAULT_HIDDEN_STATUSES = new Set(['Done', 'Canceled'])

const CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  cincin: 'Cincin', topeng: 'Topeng', clicker: 'Clicker', general: 'General',
}
type PriorityFilter = 'all' | 'cepat' | 'reguler'
type CategoryFilter = 'all' | ScheduleCategory

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
function isoPlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatColumnDate(col: string): string {
  if (col === NO_DUE_DATE_COLUMN) return 'Tanpa tgl'
  return new Date(`${col}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function WorkingProjectShippingScheduleTab() {
  const { data, isLoading } = useWorkingProjects()
  const { data: cincinIds } = useGLRingProductIds()
  const { data: topengIds } = useCategoryProductIds('topeng')
  const { data: clickerIds } = useCategoryProductIds('clicker')
  const { data: fastCouriers } = useFastCouriers()
  const { data: tableGroups } = useShippingTableGroups()

  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [dateFrom, setDateFrom] = useState(isoToday)
  const [dateTo, setDateTo] = useState(() => isoPlusDays(3))
  const [includeNoDueDate, setIncludeNoDueDate] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set(ALL_STATUSES.filter((s) => !DEFAULT_HIDDEN_STATUSES.has(s))),
  )
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [splitByPriority, setSplitByPriority] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const configuredProductIds: CategoryProductIds = useMemo(
    () => ({ cincin: cincinIds ?? [], topeng: topengIds ?? [], clicker: clickerIds ?? [] }),
    [cincinIds, topengIds, clickerIds],
  )

  const allRows = useMemo(
    () => buildShippingScheduleRows(data ?? [], configuredProductIds, fastCouriers ?? [...DEFAULT_FAST_COURIERS]),
    [data, configuredProductIds, fastCouriers],
  )

  const filteredRows = useMemo(() => {
    let out = allRows.filter((r) => statusFilter.has(r.status))
    if (priorityFilter !== 'all') out = out.filter((r) => r.priority === priorityFilter)
    if (categoryFilter !== 'all') out = out.filter((r) => r.category === categoryFilter)
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase()
      out = out.filter((r) => r.orderNo.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q) || r.product.toLowerCase().includes(q))
    }
    return out
  }, [allRows, statusFilter, priorityFilter, categoryFilter, deferredSearch])

  const dateColumns = useMemo(() => {
    const cols = dateRangeColumns(dateFrom, dateTo)
    return includeNoDueDate ? [...cols, NO_DUE_DATE_COLUMN] : cols
  }, [dateFrom, dateTo, includeNoDueDate])

  const noDueDateCount = useMemo(() => filteredRows.filter((r) => !r.dueDate).length, [filteredRows])

  const tables = useMemo(
    () => buildPivotTables(filteredRows, dateColumns, tableGroups ?? DEFAULT_SHIPPING_TABLE_GROUPS),
    [filteredRows, dateColumns, tableGroups],
  )

  const totalItems = tables.reduce((s, t) => s + t.totalRow.total.cepat + t.totalRow.total.reguler, 0)
  const totalOrders = new Set(tables.flatMap((t) => t.totalRow.total.orderNos)).size
  const categoryTotals = useMemo(() => {
    const out: Record<ScheduleCategory, number> = { cincin: 0, topeng: 0, clicker: 0, general: 0 }
    for (const r of filteredRows) {
      const dc = r.dueDate ? r.dueDate.slice(0, 10) : NO_DUE_DATE_COLUMN
      if (dateColumns.includes(dc)) out[r.category]++
    }
    return out
  }, [filteredRows, dateColumns])

  function toggleStatus(status: string) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const selectClass = 'glass-input h-9 rounded-[5px] px-2 text-sm'
  const pillClass = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full'
  const thBase = 'px-2.5 py-1.5 text-center font-semibold whitespace-nowrap g-t4'
  const tdBase = 'px-2.5 py-1.5 text-center whitespace-nowrap'

  if (isLoading) return <div className="py-12 text-center text-sm g-t4">Loading...</div>

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center mb-3 text-xs">
        <span className={pillClass} style={{ background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}>
          Total <b className="g-t1 mx-1">{totalItems}</b> item &middot; <b className="g-t1 mx-1">{totalOrders}</b> order
        </span>
        {(['cincin', 'topeng', 'clicker', 'general'] as ScheduleCategory[]).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Filter kategori ${CATEGORY_LABEL[c]}`}
            onClick={() => setCategoryFilter((prev) => (prev === c ? 'all' : c))}
            className={pillClass}
            style={{
              background: categoryFilter === c ? 'var(--g-accent-bg, var(--g-card))' : 'var(--g-card)',
              border: `1px solid ${categoryFilter === c ? 'var(--g-accent)' : 'var(--g-card-border)'}`,
            }}
          >
            {CATEGORY_LABEL[c]} <b className="g-t1">{categoryTotals[c]}</b>
          </button>
        ))}
        {noDueDateCount > 0 && !includeNoDueDate && (
          <span className={pillClass} style={{ background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}>
            <span className="g-t4">{noDueDateCount} tanpa due date (disembunyikan)</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          type="text"
          placeholder="🔍 Cari order no / customer / produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input flex-1 min-w-[160px] h-9 rounded-[5px] px-3 text-sm"
        />
        <input type="date" aria-label="Dari tanggal" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectClass} />
        <span className="g-t4 text-sm">sampai</span>
        <input type="date" aria-label="Sampai tanggal" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={selectClass} />
        <button type="button" onClick={() => { setDateFrom(isoToday()); setDateTo(isoToday()) }} className={selectClass}>Hari Ini</button>
        <button type="button" onClick={() => { setDateFrom(isoPlusDays(1)); setDateTo(isoPlusDays(1)) }} className={selectClass}>Besok</button>
        <button type="button" onClick={() => { setDateFrom(isoToday()); setDateTo(isoPlusDays(7)) }} className={selectClass}>7 Hari</button>
        <label className="flex items-center gap-1.5 text-sm g-t2">
          <input type="checkbox" checked={includeNoDueDate} onChange={(e) => setIncludeNoDueDate(e.target.checked)} />
          Termasuk tanpa due date
        </label>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select aria-label="Kategori" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)} className={selectClass}>
          <option value="all">Semua Kategori</option>
          {(['cincin', 'topeng', 'clicker', 'general'] as ScheduleCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <select aria-label="Prioritas" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)} className={selectClass}>
          <option value="all">Semua Prioritas</option>
          <option value="cepat">🚀 Cepat saja</option>
          <option value="reguler">🐢 Reguler saja</option>
        </select>
        <div className="relative">
          <button type="button" onClick={() => setStatusMenuOpen((v) => !v)} className={selectClass}>
            Status: {statusFilter.size} dipilih ▾
          </button>
          {statusMenuOpen && (
            <div className="absolute top-full left-0 mt-1 z-10 min-w-[180px] rounded-[5px] p-2" style={{ background: 'var(--g-modal)', border: '1px solid var(--g-card-border)' }}>
              {ALL_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-2 px-1.5 py-1 rounded-[4px] hover:bg-white/5 text-sm cursor-pointer">
                  <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} />
                  {s}
                </label>
              ))}
            </div>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-sm g-t2 ml-auto">
          <input type="checkbox" checked={splitByPriority} onChange={(e) => setSplitByPriority(e.target.checked)} />
          Pisahkan kurir cepat / reguler
        </label>
        {tables.length > 0 && (
          <button type="button" onClick={() => setCollapsed((prev) => (Object.keys(prev).length ? {} : Object.fromEntries(tables.map((t) => [t.key, true]))))} className={selectClass}>
            {Object.keys(collapsed).length ? 'Buka Semua' : 'Tutup Semua'}
          </button>
        )}
      </div>

      {tables.length === 0 ? (
        <div className="py-12 text-center text-sm g-t4">Tidak ada order yang cocok dengan filter di rentang tanggal ini.</div>
      ) : (
        <div className="space-y-4">
          {tables.map((table) => {
            const isCollapsed = !!collapsed[table.key]
            const grandTotal = table.totalRow.total.cepat + table.totalRow.total.reguler
            return (
              <div key={table.key} className="rounded-[5px]" style={{ border: '1px solid var(--g-card-border)' }}>
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [table.key]: !prev[table.key] }))}
                  className="w-full flex items-center justify-between px-3 py-2 text-left"
                  style={{ background: 'var(--g-card)' }}
                >
                  <span className="text-sm font-semibold g-t1">{table.title}</span>
                  <span className="text-xs g-t4">{grandTotal} pcs {isCollapsed ? '▸' : '▾'}</span>
                </button>
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className={`${thBase} text-left sticky left-0`} style={{ background: 'var(--g-card)' }}>Varian</th>
                          <th className={thBase} style={{ background: 'var(--g-card)' }}>Total</th>
                          {table.dateColumns.map((col) => (
                            <th key={col} colSpan={splitByPriority ? 2 : 1} className={thBase} style={{ background: 'var(--g-card)', borderLeft: '1px solid var(--g-card-border)' }}>
                              {formatColumnDate(col)}
                            </th>
                          ))}
                        </tr>
                        {splitByPriority && (
                          <tr>
                            <th className="sticky left-0" style={{ background: 'var(--g-card)' }}></th>
                            <th style={{ background: 'var(--g-card)' }}></th>
                            {table.dateColumns.map((col) => (
                              <Fragment key={col}>
                                <th className={`${thBase} font-normal`} style={{ borderLeft: '1px solid var(--g-card-border)' }}>🚀</th>
                                <th className={`${thBase} font-normal`}>Reg</th>
                              </Fragment>
                            ))}
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {[...table.rows, table.totalRow].map((row, i) => {
                          const isTotal = i === table.rows.length
                          return (
                            <tr key={row.label} className={isTotal ? 'font-semibold' : 'border-t'} style={isTotal ? { background: 'var(--g-card)' } : { borderColor: 'var(--g-card-border)' }}>
                              <td className={`${tdBase} text-left sticky left-0`} style={isTotal ? { background: 'var(--g-card)' } : {}}>{row.label}</td>
                              <td className={`${tdBase} g-accent`} style={isTotal ? { background: 'var(--g-card)' } : {}}>{row.total.cepat + row.total.reguler}</td>
                              {table.dateColumns.map((col) => {
                                const cell = row.cells[col]
                                const total = (cell?.cepat ?? 0) + (cell?.reguler ?? 0)
                                if (!splitByPriority) {
                                  return (
                                    <td key={col} className={tdBase} style={{ borderLeft: '1px solid var(--g-card-border)' }}>
                                      {total > 0 ? total : ''}
                                    </td>
                                  )
                                }
                                return (
                                  <Fragment key={col}>
                                    <td className={tdBase} style={{ borderLeft: '1px solid var(--g-card-border)' }}>{cell?.cepat ? cell.cepat : ''}</td>
                                    <td className={tdBase}>{cell?.reguler ? cell.reguler : ''}</td>
                                  </Fragment>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
