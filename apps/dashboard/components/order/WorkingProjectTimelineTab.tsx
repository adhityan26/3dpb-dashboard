'use client'
import { useWorkingProjects } from '@/lib/hooks/use-working-projects'

export function WorkingProjectTimelineTab() {
  const { data, isLoading } = useWorkingProjects()
  if (isLoading) return <div>Loading...</div>

  const dated = (data ?? []).filter(wp => wp.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
  const undated = (data ?? []).filter(wp => !wp.dueDate)

  return (
    <div>
      {dated.map(wp => (
        <div key={wp.id}>
          <strong>{new Date(wp.dueDate!).toLocaleDateString('id-ID')}</strong>
          <span> — </span>
          <span>{wp.title}</span>
          <span> ({wp.status})</span>
        </div>
      ))}
      {undated.length > 0 && (
        <div>
          <h4>Tanpa Tanggal</h4>
          {undated.map(wp => (
            <div key={wp.id}>
              <span>{wp.title}</span>
              <span> ({wp.status})</span>
              {wp.dueDateRaw && <span> — {wp.dueDateRaw}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
