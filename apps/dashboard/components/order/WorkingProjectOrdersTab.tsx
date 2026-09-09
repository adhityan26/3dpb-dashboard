"use client"

import { useWorkingProjects, type WorkingProjectChecklistItem } from "@/lib/hooks/use-working-projects"

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
]

export function WorkingProjectOrdersTab() {
  const { data, isLoading } = useWorkingProjects()

  if (isLoading) return <div>Loading...</div>

  return (
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
                {wp.discordThreadId ? (
                  <a href={`https://discord.com/channels/@me/${wp.discordThreadId}`}>Buka</a>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
