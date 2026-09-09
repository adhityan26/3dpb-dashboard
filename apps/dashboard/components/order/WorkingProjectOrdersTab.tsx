"use client"

import { useEffect, useState } from "react"
import {
  useWorkingProjects,
  useUpdateWorkingProject,
  type WorkingProject,
  type WorkingProjectChecklistItem,
} from "@/lib/hooks/use-working-projects"
import { WorkingProjectEditModal } from "./WorkingProjectEditModal"

const COLUMNS = [
  "Customer/Contact",
  "Produk",
  "Variant",
  "Platform",
  "No. Order",
  "Due Date",
  "Status",
  "Payment",
  "Nominal",
  "Checklist",
  "Discord",
  "Aksi",
]

function MarketplaceDetailPanel({ wp, onClose }: { wp: WorkingProject; onClose: () => void }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: unknown }
  >({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/working-projects/${wp.id}/detail-source`)
      .then(async (res) => {
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(j.error ?? `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ok", data })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: "error", message: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [wp.id])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-[5px] p-5 max-h-[80vh] overflow-y-auto"
        style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold g-t1">Data Marketplace</span>
          <button onClick={onClose} className="g-t4 text-lg leading-none" aria-label="Tutup">
            ✕
          </button>
        </div>
        {state.status === "loading" && <p className="text-xs g-t4">Memuat...</p>}
        {state.status === "error" && <p className="text-xs text-red-500">{state.message}</p>}
        {state.status === "ok" && (
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(state.data, null, 2)}</pre>
        )}
      </div>
    </div>
  )
}

export function WorkingProjectOrdersTab() {
  const { data, isLoading } = useWorkingProjects()
  const updateMutation = useUpdateWorkingProject()
  const [editing, setEditing] = useState<WorkingProject | null>(null)
  const [viewingMarketplace, setViewingMarketplace] = useState<WorkingProject | null>(null)

  if (isLoading) return <div>Loading...</div>

  return (
    <>
      <table>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.map((wp) => {
            const active = ((wp.checklist ?? []) as WorkingProjectChecklistItem[]).filter((i) => !i.deleted)
            const done = active.filter((i) => i.done).length

            return (
              <tr key={wp.id}>
                <td>
                  {wp.customer}
                  {wp.contact ? ` (${wp.contact})` : ""}
                </td>
                <td>{wp.product}</td>
                <td>{wp.variant ?? "-"}</td>
                <td>{wp.platform ?? "-"}</td>
                <td>{wp.sourceOrderNo ?? wp.orderNoLegacy ?? "-"}</td>
                <td>{wp.dueDate ? new Date(wp.dueDate).toLocaleDateString("id-ID") : (wp.dueDateRaw ?? "-")}</td>
                <td>{wp.status}</td>
                <td>{wp.payment}</td>
                <td>Rp{wp.invoiceAmount.toLocaleString("id-ID")}</td>
                <td>{`${done}/${active.length}`}</td>
                <td>
                  {wp.discordThreadUrl ? (
                    <a href={wp.discordThreadUrl}>Buka</a>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <button type="button" onClick={() => setEditing(wp)}>
                    Edit
                  </button>
                  {wp.sourceOrderNo ? (
                    <button type="button" onClick={() => setViewingMarketplace(wp)}>
                      Lihat Data Marketplace
                    </button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <WorkingProjectEditModal
        project={editing}
        onClose={() => setEditing(null)}
        isPending={updateMutation.isPending}
        onSave={({ id, patch }) => {
          updateMutation.mutate(
            { id, patch },
            {
              onSuccess: () => setEditing(null),
            },
          )
        }}
      />

      {viewingMarketplace ? (
        <MarketplaceDetailPanel wp={viewingMarketplace} onClose={() => setViewingMarketplace(null)} />
      ) : null}
    </>
  )
}
