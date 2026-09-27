'use client'
import { useMemo, useState } from 'react'
import { useWorkingProjects, useGLRingProductIds, useFastCouriers } from '@/lib/hooks/use-working-projects'
import { buildShippingScheduleRows, type ProductBucket, type ShippingScheduleRow } from '@/lib/working-projects/shipping-schedule'
import { isFastCourier, DEFAULT_FAST_COURIERS } from '@/lib/working-projects/courier'

const HIDDEN_STATUSES = new Set(['Done', 'Canceled'])

const BUCKET_LABEL: Record<ProductBucket, string> = {
  gl2026: 'Green Lantern 2026',
  cosplay: 'Cosplay',
  lainnya: 'Model Lain',
}
const BUCKET_ORDER: ProductBucket[] = ['gl2026', 'cosplay', 'lainnya']

type Priority = 'cepat' | 'reguler'
type PriorityFilter = 'all' | Priority

export interface SizeCount {
  size: string
  count: number
  orderNos: string[]
}

export interface DayGroup {
  dateKey: string
  dateLabel: string
  byPriority: Record<Priority, Partial<Record<ProductBucket, SizeCount[]>>>
}

export function sizeCountsFor(rows: ShippingScheduleRow[]): SizeCount[] {
  const bySize = new Map<string, SizeCount>()
  for (const r of rows) {
    const size = r.usSize ?? 'Tanpa Ukuran'
    const existing = bySize.get(size)
    if (existing) {
      existing.count++
      existing.orderNos.push(r.orderNo)
    } else {
      bySize.set(size, { size, count: 1, orderNos: [r.orderNo] })
    }
  }
  return [...bySize.values()].sort((a, b) => {
    const na = Number(a.size)
    const nb = Number(b.size)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return a.size.localeCompare(b.size)
  })
}

export function groupByDay(rows: ShippingScheduleRow[], fastCouriers: string[]): DayGroup[] {
  const byDate = new Map<string, ShippingScheduleRow[]>()
  for (const r of rows) {
    const key = r.dueDate ? r.dueDate.slice(0, 10) : 'no-due-date'
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(r)
  }

  const dateKeys = [...byDate.keys()].sort((a, b) => {
    if (a === 'no-due-date') return 1
    if (b === 'no-due-date') return -1
    return a.localeCompare(b)
  })

  return dateKeys.map((dateKey) => {
    const dayRows = byDate.get(dateKey)!
    const byPriority: DayGroup['byPriority'] = { cepat: {}, reguler: {} }
    for (const priority of ['cepat', 'reguler'] as const) {
      const priorityRows = dayRows.filter((r) => (isFastCourier(r.shipping, fastCouriers) ? 'cepat' : 'reguler') === priority)
      for (const bucket of BUCKET_ORDER) {
        const bucketRows = priorityRows.filter((r) => r.bucket === bucket)
        if (bucketRows.length > 0) byPriority[priority][bucket] = sizeCountsFor(bucketRows)
      }
    }
    return {
      dateKey,
      dateLabel: dateKey === 'no-due-date' ? 'Tanpa Due Date' : new Date(dateKey).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      byPriority,
    }
  })
}

const PRIORITY_LABEL: Record<Priority, string> = { cepat: '🚀 Pickup Cepat', reguler: '🐢 Pickup Reguler' }

function BucketBlock({ bucket, sizes }: { bucket: ProductBucket; sizes: SizeCount[] }) {
  return (
    <div className="min-w-[180px]">
      <div className="text-xs font-semibold g-t4 mb-1">{BUCKET_LABEL[bucket]}</div>
      <div className="flex flex-wrap gap-1.5">
        {sizes.map((s) => (
          <span
            key={s.size}
            title={s.orderNos.join(', ')}
            className="inline-block px-2 py-0.5 rounded-full text-xs font-medium g-accent"
            style={{ background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}
          >
            {s.size === 'Tanpa Ukuran' ? s.size : `US ${s.size}`} ×{s.count}
          </span>
        ))}
      </div>
    </div>
  )
}

export function WorkingProjectShippingScheduleTab() {
  const { data, isLoading } = useWorkingProjects()
  const { data: configuredProductIds } = useGLRingProductIds()
  const { data: fastCouriers } = useFastCouriers()
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')

  const rows = useMemo(() => {
    const all = buildShippingScheduleRows(data ?? [], configuredProductIds ?? [])
    return all.filter((r) => !HIDDEN_STATUSES.has(r.status))
  }, [data, configuredProductIds])

  const groups = useMemo(
    () => groupByDay(rows, fastCouriers ?? [...DEFAULT_FAST_COURIERS]),
    [rows, fastCouriers],
  )

  if (isLoading) return <div className="py-12 text-center text-sm g-t4">Loading...</div>

  const priorities: Priority[] = priorityFilter === 'all' ? ['cepat', 'reguler'] : [priorityFilter]

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <span className="text-xs g-t4">
          Cincin aktif (bukan Done/Canceled), dikelompokkan per due date. Kurir &quot;cepat&quot; diatur di Settings.
        </span>
        <select
          aria-label="Prioritas Kurir"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          className="glass-input h-9 rounded-[5px] px-2 text-sm ml-auto"
        >
          <option value="all">Semua Prioritas</option>
          <option value="cepat">🚀 Pickup Cepat saja</option>
          <option value="reguler">🐢 Pickup Reguler saja</option>
        </select>
      </div>

      {groups.length === 0 ? (
        <div className="py-12 text-center text-sm g-t4">Tidak ada cincin aktif yang perlu dikirim.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const visiblePriorities = priorities.filter((p) => Object.keys(group.byPriority[p]).length > 0)
            if (visiblePriorities.length === 0) return null
            return (
              <div key={group.dateKey} className="rounded-[5px] p-4" style={{ background: 'var(--g-card)', border: '1px solid var(--g-card-border)' }}>
                <div className="text-sm font-semibold g-t1 mb-3">{group.dateLabel}</div>
                <div className="space-y-3">
                  {visiblePriorities.map((priority) => (
                    <div key={priority}>
                      <div className="text-xs font-semibold g-accent mb-2">{PRIORITY_LABEL[priority]}</div>
                      <div className="flex flex-wrap gap-4">
                        {BUCKET_ORDER.filter((b) => group.byPriority[priority][b]).map((bucket) => (
                          <BucketBlock key={bucket} bucket={bucket} sizes={group.byPriority[priority][bucket]!} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
