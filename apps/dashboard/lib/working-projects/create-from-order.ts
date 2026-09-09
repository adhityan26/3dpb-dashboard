"use client"

// No forum-picker UI component exists yet anywhere in the codebase (checked
// components/ and app/ for anything resembling a channel/forum selector before
// adding this). Row actions fall back to a plain <select> over this allowlist,
// per task-21-brief.md.
export const WORKING_PROJECT_FORUM_CHANNELS = [
  "ORDERS_FORUM_CHANNEL_ID",
  "FORUM_TOPENG_ID",
  "FORUM_CINCIN_ID",
  "FORUM_CLICKER_ID",
] as const

export interface CreateWorkingProjectFromOrderInput {
  source: "shopee" | "tokopedia"
  sourceOrderNo: string
  forumChannelId: string
  customer: string
  contact?: string
  product: string
  variant?: string
}

export async function createWorkingProjectFromOrder(
  input: CreateWorkingProjectFromOrderInput
): Promise<void> {
  await fetch("/api/working-projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}
