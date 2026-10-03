"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useWorkingProjects, WORKING_PROJECTS_KEY } from "@/lib/hooks/use-working-projects"
import {
  WORKING_PROJECT_FORUM_CHANNELS,
  WORKING_PROJECT_FORUM_LABELS,
  createWorkingProjectFromOrder,
  describeCreateResult,
  findWorkingProjectForOrder,
  type CreateWorkingProjectFromOrderInput,
} from "@/lib/working-projects/create-from-order"

interface WorkingProjectActionProps {
  orderNo: string
  buildInput: (forumChannelId: string) => CreateWorkingProjectFromOrderInput
  /** "column" stacks select over button (Tokopedia row), "row" keeps them inline (Shopee row). */
  layout?: "row" | "column"
}

const linkStyle = { color: "#a5b4fc" }

/** Order-row Working Project control: a link to the existing WP's Discord
 * thread when one exists for this order, otherwise the forum picker + create
 * button. A WP whose thread failed shows a retry instead, since re-posting
 * retries the thread server-side. */
export function WorkingProjectAction({ orderNo, buildInput, layout = "column" }: WorkingProjectActionProps) {
  const [forumChannelId, setForumChannelId] = useState<string>(WORKING_PROJECT_FORUM_CHANNELS[0])
  const queryClient = useQueryClient()
  const { data: projects, isLoading } = useWorkingProjects()
  const existing = findWorkingProjectForOrder(projects ?? [], orderNo)

  const mutation = useMutation({
    mutationFn: createWorkingProjectFromOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKING_PROJECTS_KEY }),
  })
  const create = () => mutation.mutate(buildInput(forumChannelId))
  const failure = mutation.data && !describeCreateResult(mutation.data).ok ? describeCreateResult(mutation.data).text : null

  const wrapClass = layout === "column"
    ? "flex flex-col items-end gap-1 flex-shrink-0"
    : "flex items-center gap-2 flex-shrink-0"

  let body: React.ReactNode
  if (isLoading) {
    body = <span className="text-[11px] text-muted-foreground">…</span>
  } else if (existing?.discordThreadUrl) {
    body = (
      <a
        href={existing.discordThreadUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-xs font-medium hover:underline"
        style={linkStyle}
        title={`Working Project: ${existing.title ?? existing.customer} (${existing.status})`}
      >
        💬 Lihat WP · {existing.status}
      </a>
    )
  } else if (existing) {
    body = (
      <button
        type="button"
        onClick={create}
        disabled={mutation.isPending}
        className="flex items-center gap-1 text-xs font-medium disabled:opacity-50"
        style={{ color: "#f87171" }}
        title={existing.syncError ?? "Thread Discord belum ada"}
      >
        ⚠️ {mutation.isPending ? "Mencoba..." : "WP ada, thread gagal — coba ulang"}
      </button>
    )
  } else {
    body = (
      <>
        <select
          value={forumChannelId}
          onChange={(e) => setForumChannelId(e.target.value)}
          className="h-7 rounded-md border bg-transparent px-1 text-[11px]"
          aria-label="Forum channel Working Project"
        >
          {WORKING_PROJECT_FORUM_CHANNELS.map((id, i) => (
            <option key={id} value={id}>
              {WORKING_PROJECT_FORUM_LABELS[i]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={create}
          disabled={mutation.isPending}
          className="flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50"
          style={linkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#c7d2fe")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#a5b4fc")}
        >
          📋 {mutation.isPending ? "Membuat..." : "Buat Working Project"}
        </button>
      </>
    )
  }

  return (
    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
      <div className={wrapClass}>{body}</div>
      {mutation.isError && (
        <div className="text-[11px] text-red-500">Gagal: {(mutation.error as Error).message}</div>
      )}
      {failure && <div className="text-[11px] text-red-500 max-w-[260px] text-right">⚠️ {failure}</div>}
    </div>
  )
}
