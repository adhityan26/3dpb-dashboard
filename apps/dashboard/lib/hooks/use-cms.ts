"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  SiteSettings, GeneratorSettings, FaceshellSettings,
  GalleryItem, Testimonial, FaqItem, StravaOrder, WaitlistEntry, CmsCounts, SanityKeycapOrder
} from "@/lib/sanity/types"

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Counts (sidebar badges) ─────────────────────────────────────
export function useCmsCounts() {
  return useQuery({
    queryKey: ["cms", "counts"],
    queryFn: () => apiFetch<CmsCounts>("/api/cms/counts"),
    staleTime: 30_000,
  })
}

// ── Site Settings ───────────────────────────────────────────────
export function useSiteSettings() {
  return useQuery({
    queryKey: ["cms", "site-settings"],
    queryFn: () => apiFetch<SiteSettings>("/api/cms/site-settings"),
  })
}
export function usePatchSiteSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<SiteSettings>) =>
      apiFetch("/api/cms/site-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cms", "site-settings"] }),
  })
}

// ── Generator ───────────────────────────────────────────────────
export function useGenerator() {
  return useQuery({
    queryKey: ["cms", "generator"],
    queryFn: () => apiFetch<GeneratorSettings>("/api/cms/generator"),
  })
}
export function usePatchGenerator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<GeneratorSettings>) =>
      apiFetch("/api/cms/generator", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cms", "generator"] }),
  })
}

// ── Faceshell ───────────────────────────────────────────────────
export function useFaceshell() {
  return useQuery({
    queryKey: ["cms", "faceshell"],
    queryFn: () => apiFetch<FaceshellSettings>("/api/cms/faceshell"),
  })
}
export function usePatchFaceshell() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<FaceshellSettings>) =>
      apiFetch("/api/cms/faceshell", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cms", "faceshell"] }),
  })
}

// ── Gallery ─────────────────────────────────────────────────────
export function useGallery() {
  return useQuery({
    queryKey: ["cms", "gallery"],
    queryFn: () => apiFetch<{ items: GalleryItem[] }>("/api/cms/gallery").then(r => r.items),
  })
}
export function useGalleryMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ["cms", "gallery"] })
  const create = useMutation({
    mutationFn: (data: Omit<GalleryItem, "_id">) =>
      apiFetch("/api/cms/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<GalleryItem> & { id: string }) =>
      apiFetch(`/api/cms/gallery/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/cms/gallery/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
  const reorder = useMutation({
    mutationFn: (items: { id: string; order: number }[]) =>
      apiFetch("/api/cms/gallery/reorder", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(items) }),
    onSuccess: invalidate,
  })
  return { create, update, remove, reorder }
}

// ── Testimonials ────────────────────────────────────────────────
export function useTestimonials() {
  return useQuery({
    queryKey: ["cms", "testimonials"],
    queryFn: () => apiFetch<{ items: Testimonial[] }>("/api/cms/testimonials").then(r => r.items),
  })
}
export function useTestimonialsMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ["cms", "testimonials"] })
  const create = useMutation({
    mutationFn: (data: Omit<Testimonial, "_id">) =>
      apiFetch("/api/cms/testimonials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<Testimonial> & { id: string }) =>
      apiFetch(`/api/cms/testimonials/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/cms/testimonials/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
  const reorder = useMutation({
    mutationFn: (items: { id: string; order: number }[]) =>
      apiFetch("/api/cms/testimonials/reorder", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(items) }),
    onSuccess: invalidate,
  })
  return { create, update, remove, reorder }
}

// ── FAQ ─────────────────────────────────────────────────────────
export function useFaq() {
  return useQuery({
    queryKey: ["cms", "faq"],
    queryFn: () => apiFetch<{ items: FaqItem[] }>("/api/cms/faq").then(r => r.items),
  })
}
export function useFaqMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ["cms", "faq"] })
  const create = useMutation({
    mutationFn: (data: Omit<FaqItem, "_id">) =>
      apiFetch("/api/cms/faq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<FaqItem> & { id: string }) =>
      apiFetch(`/api/cms/faq/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/cms/faq/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  })
  const reorder = useMutation({
    mutationFn: (items: { id: string; order: number }[]) =>
      apiFetch("/api/cms/faq/reorder", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(items) }),
    onSuccess: invalidate,
  })
  return { create, update, remove, reorder }
}

// ── Strava Orders ───────────────────────────────────────────────
export function useStravaOrders() {
  return useQuery({
    queryKey: ["cms", "strava-orders"],
    queryFn: () => apiFetch<{ items: StravaOrder[] }>("/api/cms/strava-orders").then(r => r.items),
  })
}
export function usePatchStravaOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; adminNotes?: string }) =>
      apiFetch(`/api/cms/strava-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cms", "strava-orders"] }),
  })
}

// ── Keycap Orders ───────────────────────────────────────────────
export function useKeycapOrders() {
  return useQuery({
    queryKey: ["cms", "keycap-orders"],
    queryFn: () => apiFetch<{ items: SanityKeycapOrder[] }>("/api/cms/keycap-orders").then(r => r.items),
  })
}
export function usePatchKeycapOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; statusNote?: string | null }) =>
      apiFetch(`/api/cms/keycap-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cms", "keycap-orders"] }),
  })
}

// ── Waitlist ────────────────────────────────────────────────────
export function useWaitlist() {
  return useQuery({
    queryKey: ["cms", "waitlist"],
    queryFn: () => apiFetch<{ items: WaitlistEntry[] }>("/api/cms/waitlist").then(r => r.items),
  })
}
