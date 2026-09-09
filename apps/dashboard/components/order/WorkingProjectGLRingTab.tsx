'use client'
import { useState, useMemo } from 'react'
import { useWorkingProjects } from '@/lib/hooks/use-working-projects'
import { splitProductVariants, variantShort, parseSize, isGLRing } from '@/lib/working-projects/format'

type SortKey = 'customer' | 'variant' | 'size' | 'status'

export function WorkingProjectGLRingTab() {
  const { data, isLoading } = useWorkingProjects()
  const [sortKeys, setSortKeys] = useState<SortKey[]>(['customer'])
  const [filters, setFilters] = useState<{ status?: string; hasSize?: boolean; checklistDone?: boolean; platform?: string; customer?: string }>({})

  const rows = useMemo(() => {
    const active = (data ?? []).filter(wp => wp.status !== 'Canceled' && isGLRing(wp.appliedTags ?? [], wp.forumChannelId ?? null))
    const expanded = active.flatMap(wp =>
      splitProductVariants(wp.product).map(variant => {
        const { usSize, scalePct } = parseSize(wp.notes ?? '')
        return { wpId: wp.id, customer: wp.customer, variant, variantLabel: variantShort(variant), usSize, scalePct, status: wp.status, checklist: wp.checklist }
      })
    )
    let sorted = expanded
    for (const key of [...sortKeys].reverse()) {
      sorted = [...sorted].sort((a, b) => String((a as any)[key] ?? '').localeCompare(String((b as any)[key] ?? '')))
    }
    return sorted.filter(r => (!filters.status || r.status === filters.status) && (!filters.customer || r.customer === filters.customer))
  }, [data, sortKeys, filters])

  if (isLoading) return <div>Loading...</div>

  const totalRings = rows.length
  const withSize = rows.filter(r => r.usSize).length

  return (
    <div>
      <div>
        <span>Total Cincin: {totalRings}</span>
        <span>Dengan Ukuran: {withSize}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th onClick={() => setSortKeys(['customer'])}>Customer</th>
            <th onClick={() => setSortKeys(['variant'])}>Variant</th>
            <th onClick={() => setSortKeys(['size'])}>Size</th>
            <th onClick={() => setSortKeys(['status'])}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.wpId}-${i}`}>
              <td>{r.customer}</td>
              <td>{r.variantLabel}</td>
              <td>{r.usSize ? `US ${r.usSize} (${r.scalePct}%)` : '-'}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
