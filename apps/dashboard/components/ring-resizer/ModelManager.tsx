"use client"

import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"

export interface ModelManagerProps {
  models: RingModelWithParts[]
  loading: boolean
  onChanged: () => Promise<void>
}

export function ModelManager({ models, loading }: ModelManagerProps) {
  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>
  if (models.length === 0) {
    return <div className="glass-card p-6 text-sm g-t4">Belum ada model — buat model cincin pertama kamu.</div>
  }
  return <div className="glass-card p-6 text-sm g-t4">{models.length} model</div>
}
