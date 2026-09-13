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

  if (isLoading) return <div className="py-12 text-center text-sm g-t4">Loading...</div>

  const STATUS_COLOR: Record<string, string> = {
    Open: "dark:bg-blue-900/40 dark:text-blue-300 bg-blue-100 text-blue-800",
    Proses: "dark:bg-amber-900/40 dark:text-amber-300 bg-amber-100 text-amber-800",
    "Waiting Customer": "dark:bg-orange-900/40 dark:text-orange-300 bg-orange-100 text-orange-800",
    "Siap Kirim": "dark:bg-purple-900/40 dark:text-purple-300 bg-purple-100 text-purple-800",
    Done: "dark:bg-green-900/40 dark:text-green-300 bg-green-100 text-green-800",
    Canceled: "dark:bg-red-900/40 dark:text-red-300 bg-red-100 text-red-800",
  }

  return (
    <>
      <div className="overflow-x-auto rounded-[5px]" style={{ border: "1px solid var(--g-card-border)" }}>
        <table className="min-w-full border-collapse">
          <thead className="text-xs uppercase" style={{ background: "var(--g-card)" }}>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} className="px-3 py-2 text-left font-semibold whitespace-nowrap g-t4">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.map((wp) => {
              const active = ((wp.checklist ?? []) as WorkingProjectChecklistItem[]).filter((i) => !i.deleted)
              const done = active.filter((i) => i.done).length

              return (
                <tr key={wp.id} className="border-b dark:border-white/5 border-black/5 hover:bg-white/5 align-top">
                  <td className="px-3 py-2 text-sm max-w-[180px]">
                    <div className="truncate" title={`${wp.customer}${wp.contact ? ` (${wp.contact})` : ""}`}>
                      {wp.customer}
                      {wp.contact ? ` (${wp.contact})` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm max-w-[200px]">
                    <div className="truncate" title={wp.product}>{wp.product}</div>
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">{wp.variant ?? "-"}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">{wp.platform ?? "-"}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">{wp.sourceOrderNo ?? wp.orderNoLegacy ?? "-"}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    {wp.dueDate ? new Date(wp.dueDate).toLocaleDateString("id-ID") : (wp.dueDateRaw ?? "-")}
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[wp.status] ?? ""}`}>
                      {wp.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">{wp.payment}</td>
                  <td className="px-3 py-2 text-sm text-right whitespace-nowrap">Rp{wp.invoiceAmount.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 text-sm text-center whitespace-nowrap">{`${done}/${active.length}`}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    {wp.discordThreadUrl ? (
                      <a href={wp.discordThreadUrl} target="_blank" rel="noreferrer" className="g-accent underline">
                        Buka
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <div className="flex flex-col gap-1 items-start">
                      <button
                        type="button"
                        onClick={() => setEditing(wp)}
                        className="text-xs g-accent hover:underline"
                      >
                        Edit
                      </button>
                      {wp.sourceOrderNo ? (
                        <button
                          type="button"
                          onClick={() => setViewingMarketplace(wp)}
                          className="text-xs g-accent hover:underline"
                        >
                          Lihat Data Marketplace
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <WorkingProjectEditModal
        project={editing}
        onClose={() => setEditing(null)}
        isPending={updateMutation.isPending}
        error={updateMutation.error instanceof Error ? updateMutation.error.message : null}
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
