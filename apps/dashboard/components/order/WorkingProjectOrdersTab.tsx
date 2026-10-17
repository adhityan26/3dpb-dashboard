"use client"

import { useEffect, useMemo, useState } from "react"
import {
  useWorkingProjects,
  useUpdateWorkingProject,
  type WorkingProject,
  type WorkingProjectChecklistItem,
} from "@/lib/hooks/use-working-projects"
import { WorkingProjectEditModal, dueDateDisplayValue } from "./WorkingProjectEditModal"
import { WorkingProjectInvoiceButton } from "./WorkingProjectInvoiceButton"
import { InlineEditCell, WorkingProjectStatusSelect, useInlineWorkingProjectUpdate } from "./WorkingProjectInline"
import { WorkingProjectNotesModal } from "./WorkingProjectNotesModal"
import { downloadRowsAsXlsx } from "@/lib/export/xlsx"
import { resolveWpIncome } from "@/lib/working-projects/income"

const ALL_STATUSES = ["Open", "Proses", "Waiting Customer", "Siap Kirim", "Done", "Canceled"] as const
const DEFAULT_HIDDEN_STATUSES = new Set(["Done", "Canceled"])
const PAGE_SIZES = [10, 25, 50, 100] as const

type SortColumn = "customer" | "dueDate" | "status" | "invoiceAmount"

const COLUMNS: { key: SortColumn | null; label: string }[] = [
  { key: "customer", label: "Customer/Contact" },
  { key: null, label: "Produk" },
  { key: null, label: "Variant" },
  { key: null, label: "Platform" },
  { key: null, label: "No. Order" },
  { key: "dueDate", label: "Due Date" },
  { key: "status", label: "Status" },
  { key: null, label: "Kurir" },
  { key: null, label: "Payment" },
  { key: "invoiceAmount", label: "Nominal" },
  { key: null, label: "Harga Jual" },
  { key: null, label: "Biaya" },
  { key: null, label: "Pendapatan" },
  { key: null, label: "Checklist" },
  { key: null, label: "Discord" },
  { key: null, label: "Aksi" },
]

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`

/** "1 dari 2 unit order ini" when the order has several non-Canceled WPs; null otherwise. */
function unitMarker(wp: WorkingProject): string | null {
  const active = (wp.siblings ?? []).filter((s) => s.status !== "Canceled")
  const idx = active.findIndex((s) => s.id === wp.id)
  return active.length > 1 && idx >= 0 ? `${idx + 1} dari ${active.length} unit order ini` : null
}

function IncomeCells({ wp }: { wp: WorkingProject }) {
  const income = resolveWpIncome(wp)
  if (!income) {
    return (
      <>
        <td className="px-3 py-2 text-sm text-right whitespace-nowrap g-t4">-</td>
        <td className="px-3 py-2 text-sm text-right whitespace-nowrap g-t4">-</td>
        <td className="px-3 py-2 text-sm text-right whitespace-nowrap g-t4">-</td>
      </>
    )
  }
  return (
    <>
      <td className="px-3 py-2 text-sm text-right whitespace-nowrap">{rp(income.salePrice)}</td>
      <td className="px-3 py-2 text-sm text-right whitespace-nowrap">{income.feesTotal > 0 ? `-${rp(income.feesTotal)}` : rp(0)}</td>
      <td className="px-3 py-2 text-sm text-right whitespace-nowrap font-semibold">
        {rp(income.netIncome)}
        {income.status === "estimated" ? (
          <span className="ml-1 text-[10px] font-normal g-t4" title="Dana belum dilepas marketplace — angka masih estimasi">estimasi</span>
        ) : null}
      </td>
    </>
  )
}

function sortValue(wp: WorkingProject, col: SortColumn): string | number {
  switch (col) {
    case "customer": return wp.customer.toLowerCase()
    case "dueDate": return wp.dueDate ?? ""
    case "status": return wp.status
    case "invoiceAmount": return wp.invoiceAmount
  }
}

// Exported as its own row-shaping function so it's unit-testable without a
// browser download API (see lib/export/xlsx.ts).
export function ordersToExportRows(projects: WorkingProject[]): Record<string, unknown>[] {
  return projects.map((wp) => {
    const active = ((wp.checklist ?? []) as WorkingProjectChecklistItem[]).filter((i) => !i.deleted)
    const done = active.filter((i) => i.done).length
    return {
      Customer: wp.customer,
      Kontak: wp.contact ?? "",
      Produk: wp.product,
      Variant: wp.variant ?? "",
      Platform: wp.platform ?? "",
      "No. Order": wp.sourceOrderNo ?? wp.orderNoLegacy ?? "",
      "Due Date": wp.dueDate ? new Date(wp.dueDate).toLocaleDateString("id-ID") : (wp.dueDateRaw ?? ""),
      Status: wp.status,
      Payment: wp.payment,
      Nominal: wp.invoiceAmount,
      "Harga Jual": resolveWpIncome(wp)?.salePrice ?? "",
      Biaya: resolveWpIncome(wp)?.feesTotal ?? "",
      Pendapatan: resolveWpIncome(wp)?.netIncome ?? "",
      Checklist: `${done}/${active.length}`,
      Discord: wp.discordThreadUrl ?? "",
    }
  })
}

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
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-[5px] p-5 max-h-[80vh] overflow-y-auto"
        style={{ background: "var(--g-modal)", border: "1px solid var(--g-card-border)" }}
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
  const inline = useInlineWorkingProjectUpdate()
  const [editing, setEditing] = useState<WorkingProject | null>(null)
  const [editingNotes, setEditingNotes] = useState<WorkingProject | null>(null)
  const [viewingMarketplace, setViewingMarketplace] = useState<WorkingProject | null>(null)

  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState("")
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set(ALL_STATUSES.filter((s) => !DEFAULT_HIDDEN_STATUSES.has(s))),
  )
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [dueDateFrom, setDueDateFrom] = useState("")
  const [dueDateTo, setDueDateTo] = useState("")
  const [sortCol, setSortCol] = useState<SortColumn>("customer")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25)
  const [page, setPage] = useState(1)

  const platformOptions = useMemo(
    () => Array.from(new Set((data ?? []).map((wp) => wp.platform).filter((p): p is string => !!p))).sort(),
    [data],
  )

  const filtered = useMemo(() => {
    let out = data ?? []
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(
        (wp) =>
          wp.customer.toLowerCase().includes(q) ||
          wp.product.toLowerCase().includes(q) ||
          (wp.sourceOrderNo ?? wp.orderNoLegacy ?? "").toLowerCase().includes(q),
      )
    }
    if (platform) out = out.filter((wp) => wp.platform === platform)
    if (dueDateFrom) out = out.filter((wp) => wp.dueDate && wp.dueDate.slice(0, 10) >= dueDateFrom)
    if (dueDateTo) out = out.filter((wp) => wp.dueDate && wp.dueDate.slice(0, 10) <= dueDateTo)
    out = out.filter((wp) => statusFilter.has(wp.status))
    return out
  }, [data, search, platform, dueDateFrom, dueDateTo, statusFilter])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const va = sortValue(a, sortCol)
      const vb = sortValue(b, sortCol)
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === "asc" ? cmp : -cmp
    })
    return copy
  }, [filtered, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function handleSort(col: SortColumn) {
    setPage(1)
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortCol(col)
      setSortDir("asc")
    }
  }

  function toggleStatus(status: string) {
    setPage(1)
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  if (isLoading) return <div className="py-12 text-center text-sm g-t4">Loading...</div>

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="🔍 Cari customer / produk / no. order..."
          className="glass-input flex-1 min-w-[160px] h-9 rounded-[5px] px-3 text-sm"
        />
        <select
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value)
            setPage(1)
          }}
          className="glass-input h-9 rounded-[5px] px-2 text-sm"
          aria-label="Platform"
        >
          <option value="">Semua Platform</option>
          {platformOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusMenuOpen((v) => !v)}
            className="glass-input h-9 rounded-[5px] px-3 text-sm"
          >
            Status: {statusFilter.size} dipilih ▾
          </button>
          {statusMenuOpen ? (
            <div
              className="absolute top-full left-0 mt-1 z-10 min-w-[180px] rounded-[5px] p-2"
              style={{ background: "var(--g-modal)", border: "1px solid var(--g-card-border)" }}
            >
              {ALL_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-2 px-1.5 py-1 rounded-[4px] hover:bg-white/5 text-sm cursor-pointer">
                  <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} />
                  {s}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <label className="flex items-center gap-1 text-xs g-t4">
          Due
          <input
            type="date"
            aria-label="Due Date dari"
            value={dueDateFrom}
            onChange={(e) => {
              setDueDateFrom(e.target.value)
              setPage(1)
            }}
            className="glass-input h-9 rounded-[5px] px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1 text-xs g-t4">
          s/d
          <input
            type="date"
            aria-label="Due Date sampai"
            value={dueDateTo}
            onChange={(e) => {
              setDueDateTo(e.target.value)
              setPage(1)
            }}
            className="glass-input h-9 rounded-[5px] px-2 text-sm"
          />
        </label>
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])
            setPage(1)
          }}
          className="glass-input h-9 rounded-[5px] px-2 text-sm"
          aria-label="Ukuran halaman"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n} / halaman</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => downloadRowsAsXlsx(
            `working-projects-orders-${new Date().toISOString().slice(0, 10)}.xlsx`,
            "Orders",
            ordersToExportRows(sorted),
          )}
          disabled={sorted.length === 0}
          className="glass-input h-9 rounded-[5px] px-3 text-sm disabled:opacity-50"
          title="Export baris yang sedang difilter (semua halaman) ke Excel"
        >
          📊 Export Excel
        </button>
      </div>

      {inline.error ? (
        <div role="alert" className="mb-3 px-3 py-2 rounded-[5px] text-sm bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {inline.error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[5px]" style={{ border: "1px solid var(--g-card-border)" }}>
        <table className="min-w-full border-collapse">
          <thead className="text-xs uppercase" style={{ background: "var(--g-card)" }}>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  onClick={c.key ? () => handleSort(c.key as SortColumn) : undefined}
                  className={`px-3 py-2 text-left font-semibold whitespace-nowrap g-t4 ${c.key ? "cursor-pointer select-none hover:g-t1" : ""}`}
                >
                  {c.label}
                  {c.key === sortCol ? (sortDir === "asc" ? " ▲" : " ▼") : c.key ? " ↕" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((wp) => {
              const active = ((wp.checklist ?? []) as WorkingProjectChecklistItem[]).filter((i) => !i.deleted)
              const done = active.filter((i) => i.done).length

              return (
                <tr key={wp.id} className="border-b dark:border-white/5 border-black/5 hover:bg-white/5 align-top">
                  <td className="px-3 py-2 text-sm max-w-[180px]">
                    <InlineEditCell
                      label="customer"
                      value={wp.customer}
                      display={
                        <div className="truncate" title={`${wp.customer}${wp.contact ? ` (${wp.contact})` : ""}`}>
                          {wp.customer}
                          {wp.contact ? ` (${wp.contact})` : ""}
                        </div>
                      }
                      onSave={(v) => inline.save(wp.id, { customer: v }, "customer")}
                    />
                  </td>
                  <td className="px-3 py-2 text-sm max-w-[200px]">
                    <InlineEditCell
                      label="produk"
                      value={wp.product}
                      display={<div className="truncate" title={wp.product}>{wp.product}</div>}
                      onSave={(v) => inline.save(wp.id, { product: v }, "produk")}
                    />
                    {unitMarker(wp) ? <div className="text-[10px] g-t4">{unitMarker(wp)}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <InlineEditCell
                      label="variant"
                      value={wp.variant ?? ""}
                      onSave={(v) => inline.save(wp.id, { variant: v }, "variant")}
                    />
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">{wp.platform ?? "-"}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">{wp.sourceOrderNo ?? wp.orderNoLegacy ?? "-"}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <InlineEditCell
                      label="due date"
                      value={dueDateDisplayValue(wp)}
                      display={wp.dueDate ? new Date(wp.dueDate).toLocaleDateString("id-ID") : (wp.dueDateRaw ?? "-")}
                      onSave={(v) => inline.save(wp.id, { dueDateRaw: v }, "due date")}
                    />
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <WorkingProjectStatusSelect
                      value={inline.statusOverride[wp.id] ?? wp.status}
                      onChange={(s) => inline.setStatus(wp.id, s)}
                    />
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <InlineEditCell
                      label="kurir"
                      value={wp.shipping ?? ""}
                      display={wp.shipping ?? "-"}
                      onSave={(v) => inline.save(wp.id, { shipping: v }, "kurir")}
                    />
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <InlineEditCell
                      label="payment"
                      value={wp.payment}
                      onSave={(v) => inline.save(wp.id, { paymentRaw: v }, "payment")}
                    />
                  </td>
                  <td className="px-3 py-2 text-sm text-right whitespace-nowrap">
                    <InlineEditCell
                      label="nominal"
                      type="numeric"
                      value={String(wp.invoiceAmount)}
                      display={`Rp${wp.invoiceAmount.toLocaleString("id-ID")}`}
                      onSave={(v) => inline.save(wp.id, { invoiceAmountRaw: v }, "nominal")}
                      className="text-right"
                    />
                  </td>
                  <IncomeCells wp={wp} />
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
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(wp)}
                        className="g-accent hover:opacity-80 text-base leading-none"
                        title="Edit"
                        aria-label="Edit"
                      >
                        ✏️
                      </button>
                      <WorkingProjectInvoiceButton wp={wp} />
                      <button
                        type="button"
                        onClick={() => setEditingNotes(wp)}
                        className="g-accent hover:opacity-80 text-base leading-none"
                        title="Notes & Checklist"
                        aria-label="Notes & Checklist"
                      >
                        📝
                      </button>
                      {wp.sourceOrderNo ? (
                        <button
                          type="button"
                          onClick={() => setViewingMarketplace(wp)}
                          className="g-accent hover:opacity-80 text-base leading-none"
                          title="Lihat Data Marketplace"
                          aria-label="Lihat Data Marketplace"
                        >
                          🛒
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

      <div className="flex justify-between items-center mt-3 text-xs g-t4">
        <span>
          Menampilkan {sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
          {Math.min(currentPage * pageSize, sorted.length)} dari {sorted.length}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="h-8 px-2 rounded-[5px] g-btn-ghost disabled:opacity-40"
          >
            ‹ Prev
          </button>
          <span className="px-2 py-1">{currentPage} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="h-8 px-2 rounded-[5px] g-btn-ghost disabled:opacity-40"
          >
            Next ›
          </button>
        </div>
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

      <WorkingProjectNotesModal project={editingNotes} onClose={() => setEditingNotes(null)} />

      {viewingMarketplace ? (
        <MarketplaceDetailPanel wp={viewingMarketplace} onClose={() => setViewingMarketplace(null)} />
      ) : null}
    </>
  )
}
