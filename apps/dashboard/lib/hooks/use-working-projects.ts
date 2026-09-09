"use client"

import { useQuery } from "@tanstack/react-query"

export interface WorkingProjectChecklistItem {
  id: number
  text: string
  done: boolean
  deleted: boolean
}

export interface WorkingProject {
  id: string
  discordThreadId: string | null
  discordThreadUrl?: string | null
  forumChannelId?: string | null
  source: string
  sourceOrderNo: string | null
  orderNoLegacy: string | null
  syncState?: string
  syncError?: string | null
  customer: string
  contact: string | null
  platform: string | null
  product: string
  variant: string | null
  title?: string
  status: string
  payment: string
  orderDate?: string | null
  dueDate: string | null
  dueDateRaw: string | null
  invoiceAmount: number
  paidAmount?: number
  notes?: string | null
  shipping?: string | null
  trackingNo?: string | null
  checklist: WorkingProjectChecklistItem[]
  mentions?: string[]
  appliedTags?: string[]
  remindersSent?: number[]
  quotationId?: string | null
  createdAt?: string
  updatedAt?: string
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function useWorkingProjects() {
  const query = useQuery({
    queryKey: ["working-projects"],
    queryFn: () => apiFetch<WorkingProject[]>("/api/working-projects"),
  })

  return { ...query, data: query.data, isLoading: query.isLoading }
}
