"use client"

import type { RingModelWithParts } from "@/lib/hooks/use-ring-models"

export interface ProductionPanelProps {
  models: RingModelWithParts[]
  loading: boolean
}

export function ProductionPanel({ models, loading }: ProductionPanelProps) {
  if (loading) return <div className="glass-card p-6 text-sm g-t4">Memuat…</div>
  if (models.length === 0) {
    return <div className="glass-card p-6 text-sm g-t4">Belum ada model — setup model dulu di tab Setup Model.</div>
  }
  return <div className="glass-card p-6 text-sm g-t4">{models.length} model siap</div>
}
