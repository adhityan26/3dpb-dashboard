"use client"

import { useState } from "react"
import { useRingModels } from "@/lib/hooks/use-ring-models"
import { AnchorEditor } from "./AnchorEditor"
import { ModelManager } from "./ModelManager"
import { ProductionPanel } from "./ProductionPanel"

type SubTab = "setup" | "production"

/** Ring Resizer — first tool of the Produk "3D tools" family. */
export function RingResizerTab() {
  const [sub, setSub] = useState<SubTab>("production")
  const ring = useRingModels()
  const [editing, setEditing] = useState<{ modelId: string; partId: string } | null>(null)

  const editingPart = editing
    ? ring.models.find((m) => m.id === editing.modelId)?.parts.find((p) => p.id === editing.partId)
    : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSub("production")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            sub === "production" ? "bg-indigo-500 text-white" : "glass-card g-t3"
          }`}
        >
          Produksi
        </button>
        <button
          type="button"
          onClick={() => setSub("setup")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            sub === "setup" ? "bg-indigo-500 text-white" : "glass-card g-t3"
          }`}
        >
          Setup Model
        </button>
      </div>

      {ring.error && <div className="glass-card p-4 text-sm g-t2">Gagal memuat model: {ring.error}</div>}

      {sub === "setup" ? (
        editing && editingPart ? (
          <AnchorEditor
            partId={editing.partId}
            initialAnchors={editingPart.anchors}
            onClose={() => setEditing(null)}
            onSaved={ring.refresh}
          />
        ) : (
          <ModelManager models={ring.models} loading={ring.loading} onChanged={ring.refresh}
            onEditAnchors={(modelId, partId) => setEditing({ modelId, partId })} />
        )
      ) : (
        <ProductionPanel models={ring.models} loading={ring.loading} />
      )}
    </div>
  )
}
