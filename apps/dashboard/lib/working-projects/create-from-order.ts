"use client"

// No forum-picker UI component exists yet anywhere in the codebase (checked
// components/ and app/ for anything resembling a channel/forum selector before
// adding this). Row actions fall back to a plain <select> over this allowlist,
// per task-21-brief.md.
// These are real Discord forum-channel snowflake IDs in production, set via
// env vars during the Plan B production cutover. NEXT_PUBLIC_ prefix is
// required because this module is imported into "use client" row components
// and the values must be inlined at build time. The literal placeholder
// strings remain as a documented last-resort default so nothing breaks
// before the env vars are set.
export const WORKING_PROJECT_FORUM_CHANNELS = [
  process.env.NEXT_PUBLIC_ORDERS_FORUM_CHANNEL_ID ?? "ORDERS_FORUM_CHANNEL_ID",
  process.env.NEXT_PUBLIC_FORUM_TOPENG_ID ?? "FORUM_TOPENG_ID",
  process.env.NEXT_PUBLIC_FORUM_CINCIN_ID ?? "FORUM_CINCIN_ID",
  process.env.NEXT_PUBLIC_FORUM_CLICKER_ID ?? "FORUM_CLICKER_ID",
] as const

export interface CreateWorkingProjectFromOrderInput {
  source: "shopee" | "tokopedia"
  sourceOrderNo: string
  sourceProductId?: string
  forumChannelId: string
  customer: string
  contact?: string
  product: string
  variant?: string
  shipping?: string
  orderDateRaw?: string
  dueDateRaw?: string
}

export interface CreateWorkingProjectResult {
  id: string
  threadUrl: string | null
  syncState: string
  skipped: boolean
  syncError?: string
}

export async function createWorkingProjectFromOrder(
  input: CreateWorkingProjectFromOrderInput
): Promise<CreateWorkingProjectResult> {
  const res = await fetch("/api/working-projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as CreateWorkingProjectResult
}

/** One-line feedback for the order-row button. The API answers 201 even when
 * the Discord thread fails (the row is kept with syncState "error"), so a bare
 * "no error" used to look like nothing happened (found 2026-10-02). */
export function describeCreateResult(r: CreateWorkingProjectResult): { ok: boolean; text: string } {
  if (r.syncState === "error") {
    return { ok: false, text: `WP tersimpan, tapi thread Discord gagal: ${r.syncError ?? "unknown"} — klik lagi untuk coba ulang` }
  }
  return { ok: true, text: r.skipped ? "WP sudah ada untuk order ini" : "WP dibuat" }
}
