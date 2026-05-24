# Landing Page CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom CMS interface at `/landing` that manages all Sanity content (gallery, testimonials, FAQ, strava orders, waitlist, site settings, generator, faceshell) from within 3PB Ops dashboard.

**Architecture:** Next.js API routes proxy all Sanity calls server-side (write token never exposed to browser). React Query hooks in `use-cms.ts` power the UI. Left sidebar navigation within `/landing` page, content panel on right.

**Tech Stack:** `@sanity/client`, `@sanity/image-url`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@tanstack/react-query` (already installed)

---

## File Map

**New files:**
```
lib/sanity/client.ts
lib/sanity/queries.ts
lib/sanity/types.ts
lib/hooks/use-cms.ts
app/api/cms/assets/upload/route.ts
app/api/cms/site-settings/route.ts
app/api/cms/generator/route.ts
app/api/cms/faceshell/route.ts
app/api/cms/gallery/route.ts
app/api/cms/gallery/[id]/route.ts
app/api/cms/gallery/reorder/route.ts
app/api/cms/testimonials/route.ts
app/api/cms/testimonials/[id]/route.ts
app/api/cms/testimonials/reorder/route.ts
app/api/cms/faq/route.ts
app/api/cms/faq/[id]/route.ts
app/api/cms/faq/reorder/route.ts
app/api/cms/strava-orders/route.ts
app/api/cms/strava-orders/[id]/route.ts
app/api/cms/waitlist/route.ts
components/cms/shared/LocalizedField.tsx
components/cms/shared/ImageUpload.tsx
components/cms/shared/CollectionList.tsx
components/cms/shared/SortableList.tsx
components/cms/CMSSidebar.tsx
components/cms/SiteSettingsEditor.tsx
components/cms/GeneratorEditor.tsx
components/cms/FaceshellEditor.tsx
components/cms/GalleryManager.tsx
components/cms/TestimonialsManager.tsx
components/cms/FAQManager.tsx
components/cms/StravaOrdersManager.tsx
components/cms/WaitlistViewer.tsx
```

**Modified files:**
```
app/(dashboard)/landing/page.tsx   ← replace placeholder
.env.deploy.example                ← add Sanity vars
.env.deploy                        ← add Sanity vars (not committed)
deploy.sh                          ← pass Sanity vars to container
proxy.ts                           ← already has /landing for OWNER
```

---

## Task 1: Install packages + env vars

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.deploy.example`
- Modify: `.env.deploy`
- Modify: `deploy.sh`

- [ ] **Step 1: Install Sanity and dnd-kit packages**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npm install @sanity/client @sanity/image-url @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to `node_modules`, `package-lock.json` updated.

- [ ] **Step 2: Add Sanity env vars to `.env.deploy.example`**

Append to `.env.deploy.example`:
```bash
# Sanity CMS (landing page content)
SANITY_PROJECT_ID=
SANITY_DATASET=production
SANITY_API_VERSION=2024-10-01
SANITY_WRITE_TOKEN=
```

Get `SANITY_PROJECT_ID` from `/Users/adhityatangahu/Documents/Project/3dpb-app/apps/studio/sanity.config.ts` or `.env` in that project.

- [ ] **Step 3: Fill values in `.env.deploy` (not committed)**

Add the same four vars with real values from the 3dpb-app project.

- [ ] **Step 4: Pass env vars in `deploy.sh`**

In `deploy.sh`, inside the `docker run` block, add after the existing `-e` flags:
```bash
  -e SANITY_PROJECT_ID="${SANITY_PROJECT_ID:-}" \
  -e SANITY_DATASET="${SANITY_DATASET:-production}" \
  -e SANITY_API_VERSION="${SANITY_API_VERSION:-2024-10-01}" \
  -e SANITY_WRITE_TOKEN="${SANITY_WRITE_TOKEN:-}" \
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.deploy.example deploy.sh
git commit -m "feat: install sanity + dnd-kit packages, add env vars"
```

---

## Task 2: Sanity types

**Files:**
- Create: `lib/sanity/types.ts`

- [ ] **Step 1: Create `lib/sanity/types.ts`**

```ts
// Sanity raw localized field shape (from internationalizedArrayString plugin)
export type LocalizedArray = { _key: string; value: string }[]

// Flat shape used in API requests/responses
export type LocalizedValue = { id: string; en: string }

// Sanity image reference
export interface SanityImageRef {
  _type: 'image'
  asset: { _ref: string; _type: 'reference' }
  hotspot?: { x: number; y: number; height: number; width: number }
  crop?: { top: number; bottom: number; left: number; right: number }
  alt?: string
}

// Helpers — convert between Sanity wire format and flat API format
export function toLocalized(input: Partial<LocalizedValue>): LocalizedArray {
  return [
    { _key: 'id', value: input.id ?? '' },
    { _key: 'en', value: input.en ?? '' },
  ]
}

export function fromLocalized(arr: LocalizedArray | undefined): LocalizedValue {
  const out: LocalizedValue = { id: '', en: '' }
  if (!arr) return out
  for (const item of arr) {
    if (item._key === 'id') out.id = item.value ?? ''
    if (item._key === 'en') out.en = item.value ?? ''
  }
  return out
}

// ── Domain types (API response shapes) ──────────────────────────

export interface GalleryItem {
  _id: string
  title: LocalizedValue
  imageUrl: string | null
  imageRef: string | null  // Sanity asset _ref for updates
  alt: string
  category: 'custom' | 'cosplay' | 'print-service' | 'showcase'
  caption: LocalizedValue
  order: number
}

export interface Testimonial {
  _id: string
  name: string
  text: string
  imageUrl: string | null
  imageRef: string | null
  tags: string[]
  order: number
}

export interface FaqItem {
  _id: string
  question: LocalizedValue
  answer: LocalizedValue
  tags: string[]
  order: number
}

export interface StravaOrder {
  _id: string
  name: string
  whatsapp: string
  stravaUrl: string
  notes: string | null
  submittedAt: string
  size: 'small' | 'medium' | 'large'
  shape: 'square' | 'rectangle' | 'circle' | 'hexagon'
  enabledLayers: string[]
  colors: Record<string, string>
  status: 'new' | 'in-progress' | 'done' | 'cancelled'
  adminNotes: string | null
}

export interface WaitlistEntry {
  _id: string
  email: string
  name: string | null
  submittedAt: string
  source: string
}

export interface SiteSettings {
  brandName: string
  tagline: LocalizedValue
  contact: {
    whatsapp: string
    instagram: string
    email: string
    address: LocalizedValue
    operatingHours: LocalizedValue
  }
  marketplaceLinks: {
    shopee: string
    tokopedia: string
    tiktok: string
  }
  seo: {
    title: LocalizedValue
    description: LocalizedValue
  }
}

export interface GeneratorSettings {
  headline: LocalizedValue
  description: LocalizedValue
  launchStatus: 'coming-soon' | 'beta' | 'live'
  estimatedLaunch: string
  orderUrl: string
  orderLabel: LocalizedValue
  devScreenshots: { imageUrl: string; imageRef: string; alt: string }[]
}

export interface FaceshellSettings {
  headline: LocalizedValue
  description: LocalizedValue
  orderWhatsappMessage: string
  externalMeasurementUrl: string
  externalMeasurementLabel: LocalizedValue
  items: {
    _key: string
    imageUrl: string | null
    imageRef: string | null
    alt: string
    title: LocalizedValue
    caption: LocalizedValue
  }[]
}

// Sidebar counts shape
export interface CmsCounts {
  gallery: number
  testimonials: number
  faq: number
  stravaOrdersNew: number
  waitlist: number
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sanity/types.ts
git commit -m "feat(cms): add Sanity TypeScript types and localization helpers"
```

---

## Task 3: Sanity client + queries

**Files:**
- Create: `lib/sanity/client.ts`
- Create: `lib/sanity/queries.ts`

- [ ] **Step 1: Create `lib/sanity/client.ts`**

```ts
import { createClient } from '@sanity/client'

const projectId = process.env.SANITY_PROJECT_ID!
const dataset = process.env.SANITY_DATASET ?? 'production'
const apiVersion = process.env.SANITY_API_VERSION ?? '2024-10-01'

// Read-only client — uses CDN, no token
export const sanityRead = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  perspective: 'published',
})

// Write client — uses write token, bypasses CDN
export const sanityWrite = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_WRITE_TOKEN,
  perspective: 'published',
})
```

- [ ] **Step 2: Create `lib/sanity/queries.ts`**

```ts
export const Q = {
  siteSettings: `*[_type == "siteSettings"][0]{
    brandName,
    tagline,
    contact{ whatsapp, instagram, email, address, operatingHours },
    marketplaceLinks,
    seo
  }`,

  generator: `*[_type == "silhouetteGenerator"][0]{
    headline,
    description,
    launchStatus,
    estimatedLaunch,
    orderUrl,
    orderLabel,
    "devScreenshots": devScreenshots[]{
      "imageUrl": asset->url,
      "imageRef": asset._ref,
      "alt": alt
    }
  }`,

  faceshell: `*[_type == "faceshellCollection"][0]{
    headline,
    description,
    orderWhatsappMessage,
    externalMeasurementUrl,
    externalMeasurementLabel,
    "items": items[]{
      _key,
      "imageUrl": image.asset->url,
      "imageRef": image.asset._ref,
      "alt": image.alt,
      title,
      caption
    }
  }`,

  gallery: `*[_type == "galleryItem"] | order(order asc){
    _id,
    title,
    "imageUrl": image.asset->url,
    "imageRef": image.asset._ref,
    "alt": image.alt,
    category,
    caption,
    order
  }`,

  testimonials: `*[_type == "testimonial"] | order(order asc){
    _id,
    name,
    text,
    "imageUrl": image.asset->url,
    "imageRef": image.asset._ref,
    tags,
    order
  }`,

  faq: `*[_type == "faq"] | order(order asc){
    _id,
    question,
    answer,
    tags,
    order
  }`,

  stravaOrders: `*[_type == "stravaMapOrder"] | order(submittedAt desc){
    _id,
    name,
    whatsapp,
    stravaUrl,
    notes,
    submittedAt,
    size,
    shape,
    enabledLayers,
    colors,
    status,
    adminNotes
  }`,

  waitlist: `*[_type == "waitlistEntry"] | order(submittedAt desc){
    _id,
    email,
    name,
    submittedAt,
    source
  }`,

  counts: `{
    "gallery": count(*[_type == "galleryItem"]),
    "testimonials": count(*[_type == "testimonial"]),
    "faq": count(*[_type == "faq"]),
    "stravaOrdersNew": count(*[_type == "stravaMapOrder" && status == "new"]),
    "waitlist": count(*[_type == "waitlistEntry"])
  }`,
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/sanity/client.ts lib/sanity/queries.ts
git commit -m "feat(cms): add Sanity client and GROQ queries"
```

---

## Task 4: Shared component — LocalizedField

**Files:**
- Create: `components/cms/shared/LocalizedField.tsx`

- [ ] **Step 1: Create `components/cms/shared/LocalizedField.tsx`**

```tsx
"use client"

import type { LocalizedValue } from "@/lib/sanity/types"

interface LocalizedFieldProps {
  label: string
  value: LocalizedValue
  onChange: (val: LocalizedValue) => void
  multiline?: boolean
  required?: boolean
}

export function LocalizedField({ label, value, onChange, multiline = false, required = false }: LocalizedFieldProps) {
  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-indigo-500/60 resize-none"

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex gap-3">
        {(["id", "en"] as const).map((locale) => (
          <div key={locale} className="flex-1 space-y-1">
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              {locale === "id" ? "🇮🇩 Indonesia" : "🇬🇧 English"}
            </div>
            {multiline ? (
              <textarea
                rows={3}
                className={inputClass}
                value={value[locale]}
                onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
              />
            ) : (
              <input
                type="text"
                className={inputClass}
                value={value[locale]}
                onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/shared/LocalizedField.tsx
git commit -m "feat(cms): add LocalizedField shared component"
```

---

## Task 5: Shared component — CollectionList

**Files:**
- Create: `components/cms/shared/CollectionList.tsx`

- [ ] **Step 1: Create `components/cms/shared/CollectionList.tsx`**

```tsx
"use client"

interface Column<T> {
  key: string
  label: string
  render: (row: T) => React.ReactNode
  width?: string
}

interface CollectionListProps<T extends { _id: string }> {
  items: T[]
  columns: Column<T>[]
  onEdit?: (item: T) => void
  onDelete?: (id: string) => void
  isDeleting?: string | null
  emptyMessage?: string
  dragHandle?: boolean
}

export function CollectionList<T extends { _id: string }>({
  items,
  columns,
  onEdit,
  onDelete,
  isDeleting,
  emptyMessage = "Belum ada item.",
  dragHandle = false,
}: CollectionListProps<T>) {
  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-[10px] overflow-hidden border border-white/8">
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {dragHandle && <th className="w-8 px-2 py-2" />}
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                style={{ color: "rgba(165,180,252,0.6)", width: col.width }}
              >
                {col.label}
              </th>
            ))}
            {(onEdit || onDelete) && <th className="w-20 px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item._id}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              className="hover:bg-white/[0.02] transition-colors"
            >
              {dragHandle && (
                <td className="px-2 py-2 text-center" style={{ color: "rgba(255,255,255,0.2)", cursor: "grab" }}>
                  ⠿
                </td>
              )}
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {col.render(item)}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-3 py-2">
                  <div className="flex gap-2 justify-end">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(item)}
                        className="text-[11px] px-2 py-1 rounded-[6px]"
                        style={{ background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.9)" }}
                      >
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(item._id)}
                        disabled={isDeleting === item._id}
                        className="text-[11px] px-2 py-1 rounded-[6px]"
                        style={{ background: "rgba(239,68,68,0.12)", color: "rgba(252,165,165,0.8)" }}
                      >
                        {isDeleting === item._id ? "..." : "Hapus"}
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/shared/CollectionList.tsx
git commit -m "feat(cms): add CollectionList shared component"
```

---

## Task 6: Shared component — SortableList

**Files:**
- Create: `components/cms/shared/SortableList.tsx`

- [ ] **Step 1: Create `components/cms/shared/SortableList.tsx`**

```tsx
"use client"

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface SortableItemProps {
  id: string
  children: React.ReactNode
}

function SortableRow({ id, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
      className="hover:bg-white/[0.02]"
    >
      <td className="px-2 py-2 w-8">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing select-none"
          style={{ color: "rgba(255,255,255,0.2)", fontSize: 14 }}
        >
          ⠿
        </span>
      </td>
      {children}
    </tr>
  )
}

interface SortableListProps<T extends { _id: string }> {
  items: T[]
  onReorder: (newItems: T[]) => void
  renderRow: (item: T) => React.ReactNode
  headers: { label: string; width?: string }[]
  actionHeader?: boolean
}

export function SortableList<T extends { _id: string }>({
  items,
  onReorder,
  renderRow,
  headers,
  actionHeader = false,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i._id === String(active.id))
    const newIndex = items.findIndex((i) => i._id === String(over.id))
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="rounded-[10px] overflow-hidden border border-white/8">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th className="w-8 px-2 py-2" />
              {headers.map((h) => (
                <th
                  key={h.label}
                  className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                  style={{ color: "rgba(165,180,252,0.6)", width: h.width }}
                >
                  {h.label}
                </th>
              ))}
              {actionHeader && <th className="w-24 px-3 py-2" />}
            </tr>
          </thead>
          <SortableContext items={items.map((i) => i._id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {items.map((item) => (
                <SortableRow key={item._id} id={item._id}>
                  {renderRow(item)}
                </SortableRow>
              ))}
            </tbody>
          </SortableContext>
        </table>
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/shared/SortableList.tsx
git commit -m "feat(cms): add SortableList component with dnd-kit"
```

---

## Task 7: Shared component — ImageUpload

**Files:**
- Create: `components/cms/shared/ImageUpload.tsx`

- [ ] **Step 1: Create `components/cms/shared/ImageUpload.tsx`**

```tsx
"use client"

import { useRef, useState } from "react"

interface ImageUploadProps {
  currentUrl?: string | null
  label?: string
  onUpload: (result: { assetRef: string; url: string }) => void
}

export function ImageUpload({ currentUrl, label = "Gambar", onUpload }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/cms/assets/upload", { method: "POST", body: formData })
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload gagal")
      const { assetRef, url } = await res.json()
      onUpload({ assetRef, url })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload gagal")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>
        {label}
      </label>
      <div
        className="flex items-center gap-3 p-3 rounded-[8px] border border-dashed cursor-pointer"
        style={{ borderColor: "rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.05)" }}
        onClick={() => inputRef.current?.click()}
      >
        {currentUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${currentUrl}?w=80&h=80&fit=crop`} alt="" className="w-[60px] h-[60px] rounded-[6px] object-cover flex-shrink-0" />
        )}
        <div>
          <div className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            {uploading ? "Uploading..." : "Klik untuk pilih gambar"}
          </div>
          {error && <div className="text-[11px] text-red-400 mt-1">{error}</div>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/shared/ImageUpload.tsx
git commit -m "feat(cms): add ImageUpload shared component"
```

---

## Task 8: API route — assets upload

**Files:**
- Create: `app/api/cms/assets/upload/route.ts`

- [ ] **Step 1: Create upload route**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const asset = await sanityWrite.assets.upload("image", buffer, {
    filename: file.name,
    contentType: file.type,
  })

  return NextResponse.json({
    assetRef: asset._id,
    url: asset.url,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cms/assets/upload/route.ts
git commit -m "feat(cms): add asset upload API route"
```

---

## Task 9: API routes — Site Settings singleton

**Files:**
- Create: `app/api/cms/site-settings/route.ts`

- [ ] **Step 1: Create route**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await sanityRead.fetch(Q.siteSettings)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const doc = await sanityRead.fetch<{ _id: string } | null>(`*[_type == "siteSettings"][0]{ _id }`)
  if (!doc) return NextResponse.json({ error: "siteSettings document not found" }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.brandName !== undefined) patch.brandName = body.brandName
  if (body.tagline !== undefined) patch.tagline = toLocalized(body.tagline)
  if (body.contact !== undefined) {
    const c = body.contact
    if (c.whatsapp !== undefined) patch["contact.whatsapp"] = c.whatsapp
    if (c.instagram !== undefined) patch["contact.instagram"] = c.instagram
    if (c.email !== undefined) patch["contact.email"] = c.email
    if (c.address !== undefined) patch["contact.address"] = toLocalized(c.address)
    if (c.operatingHours !== undefined) patch["contact.operatingHours"] = toLocalized(c.operatingHours)
  }
  if (body.marketplaceLinks !== undefined) {
    const m = body.marketplaceLinks
    if (m.shopee !== undefined) patch["marketplaceLinks.shopee"] = m.shopee
    if (m.tokopedia !== undefined) patch["marketplaceLinks.tokopedia"] = m.tokopedia
    if (m.tiktok !== undefined) patch["marketplaceLinks.tiktok"] = m.tiktok
  }
  if (body.seo !== undefined) {
    if (body.seo.title !== undefined) patch["seo.title"] = toLocalized(body.seo.title)
    if (body.seo.description !== undefined) patch["seo.description"] = toLocalized(body.seo.description)
  }

  await sanityWrite.patch(doc._id).set(patch).commit()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cms/site-settings/route.ts
git commit -m "feat(cms): add site-settings GET/PATCH API route"
```

---

## Task 10: API routes — Generator singleton

**Files:**
- Create: `app/api/cms/generator/route.ts`

- [ ] **Step 1: Create route**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await sanityRead.fetch(Q.generator)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const doc = await sanityRead.fetch<{ _id: string } | null>(`*[_type == "silhouetteGenerator"][0]{ _id }`)
  if (!doc) return NextResponse.json({ error: "silhouetteGenerator document not found" }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.headline !== undefined) patch.headline = toLocalized(body.headline)
  if (body.description !== undefined) patch.description = toLocalized(body.description)
  if (body.launchStatus !== undefined) patch.launchStatus = body.launchStatus
  if (body.estimatedLaunch !== undefined) patch.estimatedLaunch = body.estimatedLaunch
  if (body.orderUrl !== undefined) patch.orderUrl = body.orderUrl
  if (body.orderLabel !== undefined) patch.orderLabel = toLocalized(body.orderLabel)

  await sanityWrite.patch(doc._id).set(patch).commit()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cms/generator/route.ts
git commit -m "feat(cms): add generator GET/PATCH API route"
```

---

## Task 11: API routes — Faceshell singleton

**Files:**
- Create: `app/api/cms/faceshell/route.ts`

- [ ] **Step 1: Create route**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await sanityRead.fetch(Q.faceshell)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const doc = await sanityRead.fetch<{ _id: string } | null>(`*[_type == "faceshellCollection"][0]{ _id }`)
  if (!doc) return NextResponse.json({ error: "faceshellCollection document not found" }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.headline !== undefined) patch.headline = toLocalized(body.headline)
  if (body.description !== undefined) patch.description = toLocalized(body.description)
  if (body.orderWhatsappMessage !== undefined) patch.orderWhatsappMessage = body.orderWhatsappMessage
  if (body.externalMeasurementUrl !== undefined) patch.externalMeasurementUrl = body.externalMeasurementUrl
  if (body.externalMeasurementLabel !== undefined) patch.externalMeasurementLabel = toLocalized(body.externalMeasurementLabel)

  await sanityWrite.patch(doc._id).set(patch).commit()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cms/faceshell/route.ts
git commit -m "feat(cms): add faceshell GET/PATCH API route"
```

---

## Task 12: API routes — Gallery collection

**Files:**
- Create: `app/api/cms/gallery/route.ts`
- Create: `app/api/cms/gallery/[id]/route.ts`
- Create: `app/api/cms/gallery/reorder/route.ts`

- [ ] **Step 1: Create `app/api/cms/gallery/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.gallery)
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (!body.category) return NextResponse.json({ error: "category required" }, { status: 400 })
  if (!body.imageRef) return NextResponse.json({ error: "imageRef required" }, { status: 400 })

  const doc = await sanityWrite.create({
    _type: "galleryItem",
    title: toLocalized(body.title ?? {}),
    image: { _type: "image", asset: { _type: "reference", _ref: body.imageRef }, alt: body.alt ?? "" },
    category: body.category,
    caption: toLocalized(body.caption ?? {}),
    order: body.order ?? 0,
  })
  return NextResponse.json({ _id: doc._id }, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/cms/gallery/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"
import { toLocalized } from "@/lib/sanity/types"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = toLocalized(body.title)
  if (body.category !== undefined) patch.category = body.category
  if (body.caption !== undefined) patch.caption = toLocalized(body.caption)
  if (body.order !== undefined) patch.order = body.order
  if (body.imageRef !== undefined) patch.image = { _type: "image", asset: { _type: "reference", _ref: body.imageRef }, alt: body.alt ?? "" }

  await sanityWrite.patch(id).set(patch).commit()
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  await sanityWrite.delete(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create `app/api/cms/gallery/reorder/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body: { id: string; order: number }[] = await req.json()
  const tx = sanityWrite.transaction()
  for (const { id, order } of body) {
    tx.patch(id, (p) => p.set({ order }))
  }
  await tx.commit()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cms/gallery/
git commit -m "feat(cms): add gallery CRUD + reorder API routes"
```

---

## Task 13: API routes — Testimonials collection

**Files:**
- Create: `app/api/cms/testimonials/route.ts`
- Create: `app/api/cms/testimonials/[id]/route.ts`
- Create: `app/api/cms/testimonials/reorder/route.ts`

- [ ] **Step 1: Create `app/api/cms/testimonials/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.testimonials)
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })
  if (!body.text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 })

  const doc = await sanityWrite.create({
    _type: "testimonial",
    name: body.name,
    text: body.text,
    tags: body.tags ?? [],
    order: body.order ?? 0,
    ...(body.imageRef && {
      image: { _type: "image", asset: { _type: "reference", _ref: body.imageRef }, alt: body.alt ?? "" }
    }),
  })
  return NextResponse.json({ _id: doc._id }, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/cms/testimonials/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.text !== undefined) patch.text = body.text
  if (body.tags !== undefined) patch.tags = body.tags
  if (body.order !== undefined) patch.order = body.order
  if (body.imageRef !== undefined) patch.image = { _type: "image", asset: { _type: "reference", _ref: body.imageRef }, alt: body.alt ?? "" }

  await sanityWrite.patch(id).set(patch).commit()
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  await sanityWrite.delete(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create `app/api/cms/testimonials/reorder/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body: { id: string; order: number }[] = await req.json()
  const tx = sanityWrite.transaction()
  for (const { id, order } of body) tx.patch(id, (p) => p.set({ order }))
  await tx.commit()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cms/testimonials/
git commit -m "feat(cms): add testimonials CRUD + reorder API routes"
```

---

## Task 14: API routes — FAQ collection

**Files:**
- Create: `app/api/cms/faq/route.ts`
- Create: `app/api/cms/faq/[id]/route.ts`
- Create: `app/api/cms/faq/reorder/route.ts`

- [ ] **Step 1: Create `app/api/cms/faq/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { toLocalized } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.faq)
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const doc = await sanityWrite.create({
    _type: "faq",
    question: toLocalized(body.question ?? {}),
    answer: toLocalized(body.answer ?? {}),
    tags: body.tags ?? [],
    order: body.order ?? 0,
  })
  return NextResponse.json({ _id: doc._id }, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/cms/faq/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"
import { toLocalized } from "@/lib/sanity/types"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.question !== undefined) patch.question = toLocalized(body.question)
  if (body.answer !== undefined) patch.answer = toLocalized(body.answer)
  if (body.tags !== undefined) patch.tags = body.tags
  if (body.order !== undefined) patch.order = body.order
  await sanityWrite.patch(id).set(patch).commit()
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  await sanityWrite.delete(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create `app/api/cms/faq/reorder/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body: { id: string; order: number }[] = await req.json()
  const tx = sanityWrite.transaction()
  for (const { id, order } of body) tx.patch(id, (p) => p.set({ order }))
  await tx.commit()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cms/faq/
git commit -m "feat(cms): add FAQ CRUD + reorder API routes"
```

---

## Task 15: API routes — Strava Orders + Waitlist

**Files:**
- Create: `app/api/cms/strava-orders/route.ts`
- Create: `app/api/cms/strava-orders/[id]/route.ts`
- Create: `app/api/cms/waitlist/route.ts`

- [ ] **Step 1: Create `app/api/cms/strava-orders/route.ts`**

```ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.stravaOrders)
  return NextResponse.json({ items })
}
```

- [ ] **Step 2: Create `app/api/cms/strava-orders/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityWrite } from "@/lib/sanity/client"

const VALID_STATUSES = ["new", "in-progress", "done", "cancelled"] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    patch.status = body.status
  }
  if (body.adminNotes !== undefined) patch.adminNotes = body.adminNotes

  await sanityWrite.patch(id).set(patch).commit()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create `app/api/cms/waitlist/route.ts`**

```ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const items = await sanityRead.fetch(Q.waitlist)
  return NextResponse.json({ items })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cms/strava-orders/ app/api/cms/waitlist/
git commit -m "feat(cms): add strava-orders and waitlist API routes"
```

---

## Task 16: React Query hooks — use-cms.ts

**Files:**
- Create: `lib/hooks/use-cms.ts`

- [ ] **Step 1: Create `lib/hooks/use-cms.ts`**

```ts
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  SiteSettings, GeneratorSettings, FaceshellSettings,
  GalleryItem, Testimonial, FaqItem, StravaOrder, WaitlistEntry, CmsCounts
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

// ── Waitlist ────────────────────────────────────────────────────
export function useWaitlist() {
  return useQuery({
    queryKey: ["cms", "waitlist"],
    queryFn: () => apiFetch<{ items: WaitlistEntry[] }>("/api/cms/waitlist").then(r => r.items),
  })
}
```

- [ ] **Step 2: Add counts API route** — create `app/api/cms/counts/route.ts`:

```ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import type { CmsCounts } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const counts = await sanityRead.fetch<CmsCounts>(Q.counts)
  return NextResponse.json(counts)
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-cms.ts app/api/cms/counts/
git commit -m "feat(cms): add use-cms hooks and counts API route"
```

---

## Task 17: CMSSidebar component

**Files:**
- Create: `components/cms/CMSSidebar.tsx`

- [ ] **Step 1: Create `components/cms/CMSSidebar.tsx`**

```tsx
"use client"

import { useCmsCounts } from "@/lib/hooks/use-cms"

type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"

interface NavItem {
  section: CmsSection
  icon: string
  label: string
  badge?: (counts: ReturnType<typeof useCmsCounts>["data"]) => number | null
  badgeVariant?: "default" | "alert"
}

const NAV_ITEMS: NavItem[] = [
  { section: "site-settings", icon: "⚙️", label: "Site Settings" },
  {
    section: "gallery", icon: "🖼️", label: "Galeri",
    badge: (c) => c?.gallery ?? null,
  },
  {
    section: "testimonials", icon: "💬", label: "Testimoni",
    badge: (c) => c?.testimonials ?? null,
  },
  {
    section: "faq", icon: "❓", label: "FAQ",
    badge: (c) => c?.faq ?? null,
  },
  {
    section: "strava-orders", icon: "🗺️", label: "Strava Orders",
    badge: (c) => c?.stravaOrdersNew ?? null,
    badgeVariant: "alert",
  },
  {
    section: "waitlist", icon: "📧", label: "Waitlist",
    badge: (c) => c?.waitlist ?? null,
  },
  { section: "generator", icon: "🎨", label: "Generator" },
  { section: "faceshell", icon: "🕷️", label: "Faceshell" },
]

interface CMSSidebarProps {
  active: CmsSection
  onChange: (section: CmsSection) => void
}

export function CMSSidebar({ active, onChange }: CMSSidebarProps) {
  const { data: counts } = useCmsCounts()

  return (
    <div
      className="w-[180px] flex-shrink-0 flex flex-col gap-[2px] p-2"
      style={{
        background: "rgba(10,10,30,0.6)",
        borderRight: "1px solid rgba(99,102,241,0.12)",
        minHeight: "calc(100vh - 60px)",
      }}
    >
      <div
        className="text-[9px] font-semibold uppercase tracking-widest px-2 py-2 mb-1"
        style={{ color: "rgba(255,255,255,0.2)" }}
      >
        Konten Landing
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = active === item.section
        const badgeCount = item.badge?.(counts)
        return (
          <button
            key={item.section}
            onClick={() => onChange(item.section)}
            className="flex items-center gap-2 px-2 py-[6px] rounded-[8px] w-full text-left transition-all"
            style={{
              background: isActive ? "rgba(99,102,241,0.2)" : "transparent",
              border: isActive ? "1px solid rgba(99,102,241,0.35)" : "1px solid transparent",
              color: isActive ? "white" : "rgba(255,255,255,0.45)",
            }}
          >
            <span className="text-[13px]">{item.icon}</span>
            <span className="text-[11px] font-medium flex-1">{item.label}</span>
            {badgeCount != null && badgeCount > 0 && (
              <span
                className="text-[9px] font-bold px-[5px] py-[1px] rounded-full"
                style={{
                  background: item.badgeVariant === "alert"
                    ? "rgba(245,158,11,0.25)"
                    : "rgba(99,102,241,0.3)",
                  color: item.badgeVariant === "alert"
                    ? "#f59e0b"
                    : "rgba(165,180,252,0.9)",
                }}
              >
                {badgeCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/CMSSidebar.tsx
git commit -m "feat(cms): add CMSSidebar component"
```

---

## Task 18: SiteSettingsEditor

**Files:**
- Create: `components/cms/SiteSettingsEditor.tsx`

- [ ] **Step 1: Create `components/cms/SiteSettingsEditor.tsx`**

```tsx
"use client"

import { useState, useEffect } from "react"
import { useSiteSettings, usePatchSiteSettings } from "@/lib/hooks/use-cms"
import { LocalizedField } from "./shared/LocalizedField"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }

export function SiteSettingsEditor() {
  const { data, isLoading } = useSiteSettings()
  const patch = usePatchSiteSettings()
  const [form, setForm] = useState<typeof data | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (data && !form) setForm(data) }, [data, form])

  if (isLoading || !form) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  async function handleSave() {
    if (!form) return
    await patch.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function setContact(field: string, val: string | LocalizedValue) {
    setForm((f) => f ? { ...f, contact: { ...f.contact, [field]: val } } : f)
  }
  function setMarketplace(field: string, val: string) {
    setForm((f) => f ? { ...f, marketplaceLinks: { ...f.marketplaceLinks, [field]: val } } : f)
  }
  function setSeo(field: string, val: LocalizedValue) {
    setForm((f) => f ? { ...f, seo: { ...f.seo, [field]: val } } : f)
  }

  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-indigo-500/60"
  const sectionClass = "space-y-4 pb-6 border-b border-white/6"

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <GlassPageHeader title="⚙️ Site Settings" subtitle="Brand info, kontak, marketplace links, SEO" />

      <div className={sectionClass}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>Brand</h3>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Brand Name</label>
          <input className={inputClass} value={form.brandName ?? ""} onChange={(e) => setForm((f) => f ? { ...f, brandName: e.target.value } : f)} />
        </div>
        <LocalizedField label="Tagline" value={form.tagline ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, tagline: v } : f)} />
      </div>

      <div className={sectionClass}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>Kontak</h3>
        {(["whatsapp", "instagram", "email"] as const).map((field) => (
          <div key={field}>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>{field}</label>
            <input className={inputClass} value={(form.contact as Record<string, string>)[field] ?? ""} onChange={(e) => setContact(field, e.target.value)} />
          </div>
        ))}
        <LocalizedField label="Alamat" value={form.contact.address ?? EMPTY_LOC} onChange={(v) => setContact("address", v)} multiline />
        <LocalizedField label="Jam Operasional" value={form.contact.operatingHours ?? EMPTY_LOC} onChange={(v) => setContact("operatingHours", v)} />
      </div>

      <div className={sectionClass}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>Marketplace Links</h3>
        {(["shopee", "tokopedia", "tiktok"] as const).map((field) => (
          <div key={field}>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>{field}</label>
            <input className={inputClass} value={(form.marketplaceLinks as Record<string, string>)[field] ?? ""} onChange={(e) => setMarketplace(field, e.target.value)} placeholder="https://" />
          </div>
        ))}
      </div>

      <div className={sectionClass}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>SEO</h3>
        <LocalizedField label="Title" value={form.seo?.title ?? EMPTY_LOC} onChange={(v) => setSeo("title", v)} />
        <LocalizedField label="Description" value={form.seo?.description ?? EMPTY_LOC} onChange={(v) => setSeo("description", v)} multiline />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={patch.isPending}
          className="px-5 py-2 rounded-[8px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}
        >
          {patch.isPending ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
        {saved && <span className="text-[12px]" style={{ color: "rgba(74,222,128,0.8)" }}>✓ Tersimpan</span>}
        {patch.isError && <span className="text-[12px] text-red-400">{patch.error?.message}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/SiteSettingsEditor.tsx
git commit -m "feat(cms): add SiteSettingsEditor component"
```

---

## Task 19: GeneratorEditor + FaceshellEditor

**Files:**
- Create: `components/cms/GeneratorEditor.tsx`
- Create: `components/cms/FaceshellEditor.tsx`

- [ ] **Step 1: Create `components/cms/GeneratorEditor.tsx`**

```tsx
"use client"

import { useState, useEffect } from "react"
import { useGenerator, usePatchGenerator } from "@/lib/hooks/use-cms"
import { LocalizedField } from "./shared/LocalizedField"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }

export function GeneratorEditor() {
  const { data, isLoading } = useGenerator()
  const patch = usePatchGenerator()
  const [form, setForm] = useState<typeof data | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (data && !form) setForm(data) }, [data, form])
  if (isLoading || !form) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  async function handleSave() {
    if (!form) return
    await patch.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-indigo-500/60"

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <GlassPageHeader title="🎨 Generator" subtitle="Silhouette Generator section content" />
      <LocalizedField label="Headline" value={form.headline ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, headline: v } : f)} />
      <LocalizedField label="Description" value={form.description ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, description: v } : f)} multiline />
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Launch Status</label>
        <select
          className={inputClass}
          value={form.launchStatus ?? "coming-soon"}
          onChange={(e) => setForm((f) => f ? { ...f, launchStatus: e.target.value as "coming-soon" | "beta" | "live" } : f)}
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <option value="coming-soon">Coming Soon</option>
          <option value="beta">Beta</option>
          <option value="live">Live</option>
        </select>
      </div>
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Estimated Launch</label>
        <input className={inputClass} value={form.estimatedLaunch ?? ""} placeholder="e.g. Q3 2026" onChange={(e) => setForm((f) => f ? { ...f, estimatedLaunch: e.target.value } : f)} />
      </div>
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Order URL</label>
        <input className={inputClass} value={form.orderUrl ?? ""} placeholder="https://" onChange={(e) => setForm((f) => f ? { ...f, orderUrl: e.target.value } : f)} />
      </div>
      <LocalizedField label="Order Button Label" value={form.orderLabel ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, orderLabel: v } : f)} />
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={patch.isPending} className="px-5 py-2 rounded-[8px] text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
          {patch.isPending ? "Menyimpan..." : "Simpan"}
        </button>
        {saved && <span className="text-[12px]" style={{ color: "rgba(74,222,128,0.8)" }}>✓ Tersimpan</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/cms/FaceshellEditor.tsx`**

```tsx
"use client"

import { useState, useEffect } from "react"
import { useFaceshell, usePatchFaceshell } from "@/lib/hooks/use-cms"
import { LocalizedField } from "./shared/LocalizedField"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }

export function FaceshellEditor() {
  const { data, isLoading } = useFaceshell()
  const patch = usePatchFaceshell()
  const [form, setForm] = useState<typeof data | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (data && !form) setForm(data) }, [data, form])
  if (isLoading || !form) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  async function handleSave() {
    if (!form) return
    await patch.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-indigo-500/60"

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <GlassPageHeader title="🕷️ Faceshell" subtitle="Faceshell Collection page content" />
      <LocalizedField label="Headline" value={form.headline ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, headline: v } : f)} />
      <LocalizedField label="Description" value={form.description ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, description: v } : f)} multiline />
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>External Measurement URL</label>
        <input className={inputClass} value={form.externalMeasurementUrl ?? ""} placeholder="https://" onChange={(e) => setForm((f) => f ? { ...f, externalMeasurementUrl: e.target.value } : f)} />
      </div>
      <LocalizedField label="External Measurement Button Label" value={form.externalMeasurementLabel ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, externalMeasurementLabel: v } : f)} />
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Pre-filled WhatsApp Order Message</label>
        <textarea rows={3} className={inputClass + " resize-none"} value={form.orderWhatsappMessage ?? ""} onChange={(e) => setForm((f) => f ? { ...f, orderWhatsappMessage: e.target.value } : f)} />
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={patch.isPending} className="px-5 py-2 rounded-[8px] text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
          {patch.isPending ? "Menyimpan..." : "Simpan"}
        </button>
        {saved && <span className="text-[12px]" style={{ color: "rgba(74,222,128,0.8)" }}>✓ Tersimpan</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/cms/GeneratorEditor.tsx components/cms/FaceshellEditor.tsx
git commit -m "feat(cms): add GeneratorEditor and FaceshellEditor components"
```

---

## Task 20: GalleryManager

**Files:**
- Create: `components/cms/GalleryManager.tsx`

- [ ] **Step 1: Create `components/cms/GalleryManager.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useGallery, useGalleryMutations } from "@/lib/hooks/use-cms"
import { SortableList } from "./shared/SortableList"
import { LocalizedField } from "./shared/LocalizedField"
import { ImageUpload } from "./shared/ImageUpload"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { GalleryItem, LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }
const EMPTY_FORM = { title: EMPTY_LOC, imageUrl: null as string | null, imageRef: null as string | null, alt: "", category: "custom" as const, caption: EMPTY_LOC, order: 0 }

export function GalleryManager() {
  const { data: items = [], isLoading } = useGallery()
  const { create, update, remove, reorder } = useGalleryMutations()
  const [editing, setEditing] = useState<GalleryItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  function openCreate() { setForm(EMPTY_FORM); setCreating(true); setEditing(null) }
  function openEdit(item: GalleryItem) {
    setForm({ title: item.title, imageUrl: item.imageUrl, imageRef: item.imageRef, alt: item.alt, category: item.category, caption: item.caption, order: item.order })
    setEditing(item)
    setCreating(false)
  }
  function closeForm() { setCreating(false); setEditing(null) }

  async function handleSave() {
    if (creating) {
      await create.mutateAsync({ ...form, _id: "" } as Omit<GalleryItem, "_id">)
    } else if (editing) {
      await update.mutateAsync({ id: editing._id, ...form })
    }
    closeForm()
  }

  function handleReorder(newItems: GalleryItem[]) {
    const ordered = newItems.map((item, i) => ({ ...item, order: i * 10 }))
    reorder.mutate(ordered.map((i) => ({ id: i._id, order: i.order })))
  }

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const CATEGORIES = ["custom", "cosplay", "print-service", "showcase"] as const

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <GlassPageHeader title="🖼️ Galeri" subtitle={`${items.length} item — drag untuk reorder`} />
        <button onClick={openCreate} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
          + Tambah
        </button>
      </div>

      {(creating || editing) && (
        <div className="p-4 rounded-[12px] border space-y-4" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
          <h3 className="text-[13px] font-semibold text-white">{creating ? "Tambah Item Galeri" : "Edit Item Galeri"}</h3>
          <ImageUpload currentUrl={form.imageUrl} label="Gambar *" onUpload={({ assetRef, url }) => setForm((f) => ({ ...f, imageRef: assetRef, imageUrl: url }))} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Alt Text</label>
            <input className="w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none" value={form.alt} onChange={(e) => setForm((f) => ({ ...f, alt: e.target.value }))} />
          </div>
          <LocalizedField label="Judul" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Kategori *</label>
            <select className="w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none" style={{ background: "rgba(10,10,30,0.8)" }} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof form.category }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <LocalizedField label="Caption" value={form.caption} onChange={(v) => setForm((f) => ({ ...f, caption: v }))} multiline />
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={create.isPending || update.isPending} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
              {create.isPending || update.isPending ? "Menyimpan..." : "Simpan"}
            </button>
            <button onClick={closeForm} className="px-4 py-2 rounded-[8px] text-[12px] text-white/50 hover:text-white/80">Batal</button>
          </div>
        </div>
      )}

      <SortableList
        items={items}
        onReorder={handleReorder}
        headers={[{ label: "Gambar", width: "60px" }, { label: "Judul / Kategori" }, { label: "Aksi", width: "120px" }]}
        actionHeader
        renderRow={(item) => (
          <>
            <td className="px-3 py-2 w-[60px]">
              {item.imageUrl && <img src={`${item.imageUrl}?w=48&h=48&fit=crop`} alt={item.alt} className="w-10 h-10 rounded-[6px] object-cover" />}
            </td>
            <td className="px-3 py-2">
              <div className="text-[12px] text-white/80">{item.title.id || item.title.en || "(no title)"}</div>
              <div className="text-[10px] text-white/35">{item.category}</div>
            </td>
            <td className="px-3 py-2">
              <div className="flex gap-2 justify-end">
                <button onClick={() => openEdit(item)} className="text-[11px] px-2 py-1 rounded-[6px]" style={{ background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.9)" }}>Edit</button>
                <button onClick={() => remove.mutate(item._id)} disabled={remove.isPending} className="text-[11px] px-2 py-1 rounded-[6px]" style={{ background: "rgba(239,68,68,0.12)", color: "rgba(252,165,165,0.8)" }}>Hapus</button>
              </div>
            </td>
          </>
        )}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/GalleryManager.tsx
git commit -m "feat(cms): add GalleryManager with sortable list"
```

---

## Task 21: TestimonialsManager

**Files:**
- Create: `components/cms/TestimonialsManager.tsx`

- [ ] **Step 1: Create `components/cms/TestimonialsManager.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useTestimonials, useTestimonialsMutations } from "@/lib/hooks/use-cms"
import { SortableList } from "./shared/SortableList"
import { ImageUpload } from "./shared/ImageUpload"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { Testimonial } from "@/lib/sanity/types"

const ALL_TAGS = ["general", "faceshell", "generator"] as const
const EMPTY_FORM = { name: "", text: "", imageUrl: null as string | null, imageRef: null as string | null, tags: [] as string[], order: 0 }

export function TestimonialsManager() {
  const { data: items = [], isLoading } = useTestimonials()
  const { create, update, remove, reorder } = useTestimonialsMutations()
  const [editing, setEditing] = useState<Testimonial | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  function openCreate() { setForm(EMPTY_FORM); setCreating(true); setEditing(null) }
  function openEdit(item: Testimonial) {
    setForm({ name: item.name, text: item.text, imageUrl: item.imageUrl, imageRef: item.imageRef, tags: item.tags, order: item.order })
    setEditing(item); setCreating(false)
  }
  function closeForm() { setCreating(false); setEditing(null) }

  async function handleSave() {
    if (creating) await create.mutateAsync({ ...form, _id: "" } as Omit<Testimonial, "_id">)
    else if (editing) await update.mutateAsync({ id: editing._id, ...form })
    closeForm()
  }

  function toggleTag(tag: string) {
    setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }))
  }

  function handleReorder(newItems: Testimonial[]) {
    reorder.mutate(newItems.map((item, i) => ({ id: item._id, order: i * 10 })))
  }

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 focus:outline-none"

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <GlassPageHeader title="💬 Testimoni" subtitle={`${items.length} testimoni`} />
        <button onClick={openCreate} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>+ Tambah</button>
      </div>

      {(creating || editing) && (
        <div className="p-4 rounded-[12px] border space-y-4" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
          <h3 className="text-[13px] font-semibold text-white">{creating ? "Tambah Testimoni" : "Edit Testimoni"}</h3>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Nama *</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Teks *</label>
            <textarea rows={4} className={inputClass + " resize-none"} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
          </div>
          <ImageUpload currentUrl={form.imageUrl} label="Foto (opsional)" onUpload={({ assetRef, url }) => setForm((f) => ({ ...f, imageRef: assetRef, imageUrl: url }))} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(165,180,252,0.6)" }}>Tags</label>
            <div className="flex gap-2">
              {ALL_TAGS.map((tag) => (
                <button key={tag} onClick={() => toggleTag(tag)} className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
                  style={{ background: form.tags.includes(tag) ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.05)", color: form.tags.includes(tag) ? "rgba(165,180,252,1)" : "rgba(255,255,255,0.4)", border: form.tags.includes(tag) ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent" }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={create.isPending || update.isPending} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
              {create.isPending || update.isPending ? "Menyimpan..." : "Simpan"}
            </button>
            <button onClick={closeForm} className="px-4 py-2 rounded-[8px] text-[12px] text-white/50 hover:text-white/80">Batal</button>
          </div>
        </div>
      )}

      <SortableList
        items={items}
        onReorder={handleReorder}
        headers={[{ label: "Nama" }, { label: "Teks" }, { label: "Tags" }, { label: "Aksi", width: "120px" }]}
        actionHeader
        renderRow={(item) => (
          <>
            <td className="px-3 py-2 text-[12px] text-white/80 w-[120px]">{item.name}</td>
            <td className="px-3 py-2 text-[12px] text-white/50 max-w-[200px] truncate">{item.text.slice(0, 60)}...</td>
            <td className="px-3 py-2"><div className="flex gap-1 flex-wrap">{item.tags.map((t) => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.2)", color: "rgba(165,180,252,0.8)" }}>{t}</span>)}</div></td>
            <td className="px-3 py-2">
              <div className="flex gap-2 justify-end">
                <button onClick={() => openEdit(item)} className="text-[11px] px-2 py-1 rounded-[6px]" style={{ background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.9)" }}>Edit</button>
                <button onClick={() => remove.mutate(item._id)} disabled={remove.isPending} className="text-[11px] px-2 py-1 rounded-[6px]" style={{ background: "rgba(239,68,68,0.12)", color: "rgba(252,165,165,0.8)" }}>Hapus</button>
              </div>
            </td>
          </>
        )}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/TestimonialsManager.tsx
git commit -m "feat(cms): add TestimonialsManager component"
```

---

## Task 22: FAQManager

**Files:**
- Create: `components/cms/FAQManager.tsx`

- [ ] **Step 1: Create `components/cms/FAQManager.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useFaq, useFaqMutations } from "@/lib/hooks/use-cms"
import { SortableList } from "./shared/SortableList"
import { LocalizedField } from "./shared/LocalizedField"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { FaqItem, LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }
const ALL_TAGS = ["general", "faceshell", "generator", "shipping"] as const
const EMPTY_FORM = { question: EMPTY_LOC, answer: EMPTY_LOC, tags: [] as string[], order: 0 }

export function FAQManager() {
  const { data: items = [], isLoading } = useFaq()
  const { create, update, remove, reorder } = useFaqMutations()
  const [editing, setEditing] = useState<FaqItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  function openCreate() { setForm(EMPTY_FORM); setCreating(true); setEditing(null) }
  function openEdit(item: FaqItem) {
    setForm({ question: item.question, answer: item.answer, tags: item.tags, order: item.order })
    setEditing(item); setCreating(false)
  }
  function closeForm() { setCreating(false); setEditing(null) }

  async function handleSave() {
    if (creating) await create.mutateAsync({ ...form, _id: "" } as Omit<FaqItem, "_id">)
    else if (editing) await update.mutateAsync({ id: editing._id, ...form })
    closeForm()
  }

  function toggleTag(tag: string) {
    setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }))
  }

  function handleReorder(newItems: FaqItem[]) {
    reorder.mutate(newItems.map((item, i) => ({ id: item._id, order: i * 10 })))
  }

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <GlassPageHeader title="❓ FAQ" subtitle={`${items.length} pertanyaan`} />
        <button onClick={openCreate} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>+ Tambah</button>
      </div>

      {(creating || editing) && (
        <div className="p-4 rounded-[12px] border space-y-4" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
          <h3 className="text-[13px] font-semibold text-white">{creating ? "Tambah FAQ" : "Edit FAQ"}</h3>
          <LocalizedField label="Pertanyaan *" value={form.question} onChange={(v) => setForm((f) => ({ ...f, question: v }))} required />
          <LocalizedField label="Jawaban *" value={form.answer} onChange={(v) => setForm((f) => ({ ...f, answer: v }))} multiline required />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(165,180,252,0.6)" }}>Tags</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_TAGS.map((tag) => (
                <button key={tag} onClick={() => toggleTag(tag)} className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
                  style={{ background: form.tags.includes(tag) ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.05)", color: form.tags.includes(tag) ? "rgba(165,180,252,1)" : "rgba(255,255,255,0.4)", border: form.tags.includes(tag) ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent" }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={create.isPending || update.isPending} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}>
              {create.isPending || update.isPending ? "Menyimpan..." : "Simpan"}
            </button>
            <button onClick={closeForm} className="px-4 py-2 rounded-[8px] text-[12px] text-white/50 hover:text-white/80">Batal</button>
          </div>
        </div>
      )}

      <SortableList
        items={items}
        onReorder={handleReorder}
        headers={[{ label: "Pertanyaan" }, { label: "Tags" }, { label: "Aksi", width: "120px" }]}
        actionHeader
        renderRow={(item) => (
          <>
            <td className="px-3 py-2 text-[12px] text-white/80">{item.question.id || item.question.en}</td>
            <td className="px-3 py-2"><div className="flex gap-1 flex-wrap">{item.tags.map((t) => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.2)", color: "rgba(165,180,252,0.8)" }}>{t}</span>)}</div></td>
            <td className="px-3 py-2">
              <div className="flex gap-2 justify-end">
                <button onClick={() => openEdit(item)} className="text-[11px] px-2 py-1 rounded-[6px]" style={{ background: "rgba(99,102,241,0.15)", color: "rgba(165,180,252,0.9)" }}>Edit</button>
                <button onClick={() => remove.mutate(item._id)} disabled={remove.isPending} className="text-[11px] px-2 py-1 rounded-[6px]" style={{ background: "rgba(239,68,68,0.12)", color: "rgba(252,165,165,0.8)" }}>Hapus</button>
              </div>
            </td>
          </>
        )}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/cms/FAQManager.tsx
git commit -m "feat(cms): add FAQManager component"
```

---

## Task 23: StravaOrdersManager + WaitlistViewer

**Files:**
- Create: `components/cms/StravaOrdersManager.tsx`
- Create: `components/cms/WaitlistViewer.tsx`

- [ ] **Step 1: Create `components/cms/StravaOrdersManager.tsx`**

```tsx
"use client"

import { useStravaOrders, usePatchStravaOrder } from "@/lib/hooks/use-cms"
import { CollectionList } from "./shared/CollectionList"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { StravaOrder } from "@/lib/sanity/types"

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new:          { bg: "rgba(245,158,11,0.2)",  color: "#f59e0b" },
  "in-progress":{ bg: "rgba(99,102,241,0.2)",  color: "#a5b4fc" },
  done:         { bg: "rgba(34,197,94,0.15)",  color: "#4ade80" },
  cancelled:    { bg: "rgba(239,68,68,0.15)",  color: "#fca5a5" },
}

export function StravaOrdersManager() {
  const { data: items = [], isLoading } = useStravaOrders()
  const patch = usePatchStravaOrder()

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const newCount = items.filter((i) => i.status === "new").length

  return (
    <div className="p-6 space-y-4">
      <GlassPageHeader
        title="🗺️ Strava Map Orders"
        subtitle={`${items.length} total${newCount > 0 ? ` · ${newCount} baru perlu diproses` : ""}`}
      />

      <CollectionList
        items={items}
        emptyMessage="Belum ada order Strava Map."
        columns={[
          {
            key: "customer",
            label: "Pelanggan",
            width: "160px",
            render: (item: StravaOrder) => (
              <div>
                <div className="text-[12px] text-white/80">{item.name}</div>
                <a href={`https://wa.me/${item.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-[10px]" style={{ color: "rgba(74,222,128,0.7)" }}>
                  {item.whatsapp}
                </a>
              </div>
            ),
          },
          {
            key: "config",
            label: "Konfigurasi",
            render: (item: StravaOrder) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {item.size} · {item.shape}
              </div>
            ),
          },
          {
            key: "submitted",
            label: "Tanggal",
            width: "100px",
            render: (item: StravaOrder) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {new Date(item.submittedAt).toLocaleDateString("id-ID")}
              </div>
            ),
          },
          {
            key: "status",
            label: "Status",
            width: "160px",
            render: (item: StravaOrder) => (
              <select
                value={item.status}
                onChange={(e) => patch.mutate({ id: item._id, status: e.target.value })}
                disabled={patch.isPending}
                className="rounded-[6px] px-2 py-1 text-[11px] font-medium border-0 cursor-pointer"
                style={{ ...(STATUS_COLORS[item.status] ?? {}), background: STATUS_COLORS[item.status]?.bg }}
              >
                <option value="new">new</option>
                <option value="in-progress">in-progress</option>
                <option value="done">done</option>
                <option value="cancelled">cancelled</option>
              </select>
            ),
          },
        ]}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create `components/cms/WaitlistViewer.tsx`**

```tsx
"use client"

import { useWaitlist } from "@/lib/hooks/use-cms"
import { CollectionList } from "./shared/CollectionList"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { WaitlistEntry } from "@/lib/sanity/types"

export function WaitlistViewer() {
  const { data: items = [], isLoading } = useWaitlist()
  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  return (
    <div className="p-6 space-y-4">
      <GlassPageHeader title="📧 Waitlist" subtitle={`${items.length} pendaftar`} />
      <CollectionList
        items={items}
        emptyMessage="Belum ada yang daftar waitlist."
        columns={[
          {
            key: "email",
            label: "Email",
            render: (item: WaitlistEntry) => <span className="text-[12px] text-white/80">{item.email}</span>,
          },
          {
            key: "name",
            label: "Nama",
            width: "160px",
            render: (item: WaitlistEntry) => <span className="text-[12px] text-white/60">{item.name ?? "-"}</span>,
          },
          {
            key: "date",
            label: "Tanggal",
            width: "120px",
            render: (item: WaitlistEntry) => (
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString("id-ID") : "-"}
              </span>
            ),
          },
        ]}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/cms/StravaOrdersManager.tsx components/cms/WaitlistViewer.tsx
git commit -m "feat(cms): add StravaOrdersManager and WaitlistViewer"
```

---

## Task 24: Wire up /landing/page.tsx

**Files:**
- Modify: `app/(dashboard)/landing/page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/landing/page.tsx`**

```tsx
"use client"

import { Suspense, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { CMSSidebar } from "@/components/cms/CMSSidebar"
import { SiteSettingsEditor } from "@/components/cms/SiteSettingsEditor"
import { GalleryManager } from "@/components/cms/GalleryManager"
import { TestimonialsManager } from "@/components/cms/TestimonialsManager"
import { FAQManager } from "@/components/cms/FAQManager"
import { StravaOrdersManager } from "@/components/cms/StravaOrdersManager"
import { WaitlistViewer } from "@/components/cms/WaitlistViewer"
import { GeneratorEditor } from "@/components/cms/GeneratorEditor"
import { FaceshellEditor } from "@/components/cms/FaceshellEditor"

type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"

export default function LandingPage() {
  return (
    <Suspense>
      <LandingPageInner />
    </Suspense>
  )
}

function LandingPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const rawSection = searchParams.get("section") ?? "site-settings"
  const validSections: CmsSection[] = ["site-settings", "gallery", "testimonials", "faq", "strava-orders", "waitlist", "generator", "faceshell"]
  const activeSection: CmsSection = validSections.includes(rawSection as CmsSection) ? (rawSection as CmsSection) : "site-settings"

  function setSection(section: CmsSection) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("section", section)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex min-h-screen -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <CMSSidebar active={activeSection} onChange={setSection} />
      <div className="flex-1 overflow-auto">
        {activeSection === "site-settings"  && <SiteSettingsEditor />}
        {activeSection === "gallery"         && <GalleryManager />}
        {activeSection === "testimonials"    && <TestimonialsManager />}
        {activeSection === "faq"             && <FAQManager />}
        {activeSection === "strava-orders"   && <StravaOrdersManager />}
        {activeSection === "waitlist"        && <WaitlistViewer />}
        {activeSection === "generator"       && <GeneratorEditor />}
        {activeSection === "faceshell"       && <FaceshellEditor />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(dashboard)/landing/page.tsx
git commit -m "feat(cms): wire up /landing page with sidebar + all CMS sections"
```

---

## Task 25: Build + verify + deploy

- [ ] **Step 1: Run TypeScript check locally**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 2: Deploy**

```bash
bash deploy.sh build
```

Expected: exit code 0, container running.

- [ ] **Step 3: Smoke test each section**

Navigate to `https://dashboard.3dprintingbandung.my.id/landing` and verify:
- Sidebar shows 8 sections with correct badges
- Site Settings loads and Save works (check Sanity Studio to confirm change)
- Gallery list loads, can add/edit/delete/reorder
- Testimonials list loads, can add/edit/delete/reorder
- FAQ list loads, can add/edit/delete/reorder
- Strava Orders loads with status dropdown
- Waitlist loads
- Generator and Faceshell load and save correctly

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(cms): post-deploy fixes"
```
