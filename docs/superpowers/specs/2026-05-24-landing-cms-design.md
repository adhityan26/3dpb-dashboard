# Landing Page CMS — Design Spec
**Date:** 2026-05-24  
**Project:** 3PB Ops (`shopee-dashboard`)  
**Route:** `/landing`

---

## Overview

Build a custom CMS interface inside `/landing` that lets operators manage all content for the 3DPB landing page (currently at `3dprintingbandung.my.id`), replacing the need to open Sanity Studio separately. All content is stored in Sanity CMS (project from `3dpb-app`); this dashboard connects to the same Sanity project via API.

**Out of scope (this spec):** Produk/catalog management — this is handled separately since product data already exists in 3PB Ops from Shopee.

---

## Content Types

### Singletons (no list — edit directly)
| Type | Sanity `_type` | Description |
|------|----------------|-------------|
| Site Settings | `siteSettings` | Brand name, tagline, contact (WA/IG/email), marketplace links (Shopee/Tokopedia/TikTok), section headings, pillar cards, Strava map preview images, SEO |
| Generator | `silhouetteGenerator` | Silhouette generator section — headline, description, dev screenshots, launch status, order URL |
| Faceshell | `faceshellCollection` | Faceshell page — collection items, measurement guide steps, pre-filled WhatsApp order message |

### Collections (list + CRUD)
| Type | Sanity `_type` | Operations |
|------|----------------|------------|
| Galeri | `galleryItem` | Create, Read, Update, Delete, drag-to-reorder |
| Testimoni | `testimonial` | Create, Read, Update, Delete, drag-to-reorder |
| FAQ | `faq` | Create, Read, Update, Delete, drag-to-reorder |
| Strava Orders | `stravaMapOrder` | Read, update status only (new/in-progress/done/cancelled) |
| Waitlist | `waitlistEntry` | Read-only |

---

## Architecture

### Data Flow
```
Browser (React components)
    ↓ fetch (React Query)
/api/cms/[section]  ← Next.js API routes (server-side only)
    ↓ @sanity/client
Sanity API (same project as 3dpb-app)
```

### Approach: API Routes Proxy (Option A)
All Sanity access is server-side via Next.js API routes. The Sanity write token is never exposed to the browser. Read requests use the public CDN; write requests use the write token.

---

## API Routes

All routes under `/api/cms/`. Auth is enforced by the existing `proxy.ts` middleware — only authenticated users with OWNER or ADMIN role can access the dashboard.

### Singletons
| Route | GET | PATCH |
|-------|-----|-------|
| `/api/cms/site-settings` | Fetch siteSettings doc | Update fields |
| `/api/cms/generator` | Fetch silhouetteGenerator doc | Update fields |
| `/api/cms/faceshell` | Fetch faceshellCollection doc | Update fields |

### Collections
| Route | GET | POST | PATCH | DELETE |
|-------|-----|------|-------|--------|
| `/api/cms/gallery` | List all | Create | — | — |
| `/api/cms/gallery/[id]` | — | — | Update | Delete |
| `/api/cms/testimonials` | List all | Create | — | — |
| `/api/cms/testimonials/[id]` | — | — | Update | Delete |
| `/api/cms/faq` | List all | Create | — | — |
| `/api/cms/faq/[id]` | — | — | Update | Delete |
| `/api/cms/strava-orders` | List all | — | — | — |
| `/api/cms/strava-orders/[id]` | — | — | Update status | — |
| `/api/cms/waitlist` | List all | — | — | — |

### Assets
| Route | Method | Description |
|-------|--------|-------------|
| `/api/cms/assets/upload` | POST | `multipart/form-data` → Sanity assets API → returns `{ assetId, url }` |

---

## Sanity Client

**`lib/sanity/client.ts`** — exports two clients:
- `sanityReadClient` — `useCdn: true`, no token, for GET requests
- `sanityWriteClient` — `useCdn: false`, `SANITY_WRITE_TOKEN`, for mutations

**`lib/sanity/queries.ts`** — GROQ queries per content type (one export per type)

**`lib/sanity/types.ts`** — TypeScript types mirroring Sanity schemas, including the localized field shape `{ _key: 'id' | 'en', value: string }[]`

### New Environment Variables
```bash
SANITY_PROJECT_ID=           # from 3dpb-app sanity.config.ts
SANITY_DATASET=production
SANITY_API_VERSION=2024-10-01
SANITY_WRITE_TOKEN=          # Sanity API token with write access
```

Added to `.env.deploy` and `.env.deploy.example`.

---

## Page Layout (`/landing`)

The existing placeholder page is replaced with a two-column layout:

```
┌─────────────────────────────────────────────────────┐
│  Top nav (existing — unchanged)                      │
├──────────────┬──────────────────────────────────────┤
│  CMSSidebar  │  Active section content               │
│  (180px)     │                                       │
│              │  Singletons → form edit               │
│  ⚙️ Settings │  Collections → list + CRUD            │
│  🖼️ Galeri 12│  Orders → table + status              │
│  💬 Testimoni│  Waitlist → read-only table           │
│  ❓ FAQ      │                                       │
│  🗺️ Strava 3 │                                       │
│  📧 Waitlist │                                       │
│  🎨 Generator│                                       │
│  🕷️ Faceshell│                                       │
└──────────────┴──────────────────────────────────────┘
```

Active section is tracked via `?section=` URL search param (replaces page on change, preserves browser back).

Sidebar badges:
- Collections: total item count (indigo chip)
- Strava Orders: count of `status === 'new'` (amber — indicates action needed)
- Waitlist: total count (indigo)
- Singletons: no badge

---

## Component Structure

```
components/cms/
  CMSSidebar.tsx           Navigation + badges
  SiteSettingsEditor.tsx   Singleton form — brand/contact/SEO
  GalleryManager.tsx       List + add/edit/delete
  TestimonialsManager.tsx  List + add/edit/delete
  FAQManager.tsx           List + add/edit/delete
  StravaOrdersManager.tsx  Table + status dropdown
  WaitlistViewer.tsx       Read-only table (email, nama, timestamp)
  GeneratorEditor.tsx      Singleton form
  FaceshellEditor.tsx      Singleton form (complex — includes nested items array)
  shared/
    LocalizedField.tsx     Side-by-side 🇮🇩 id / 🇬🇧 en text inputs
    ImageUpload.tsx        Drag-drop or click upload → /api/cms/assets/upload
    CollectionList.tsx     Reusable table: columns, actions, empty state
    SortableList.tsx       Drag-to-reorder wrapper (dnd-kit) — used by Gallery, Testimoni, FAQ

lib/hooks/
  use-cms.ts               React Query hooks:
                           - useSiteSettings() + usePatchSiteSettings()
                           - useGallery() + useCmsGalleryMutations()
                           - useTestimonials() + useCmsTestimonialsMutations()
                           - useFaq() + useCmsFaqMutations()
                           - useStravaOrders() + usePatchStravaOrder()
                           - useWaitlist()
                           - useGenerator() + usePatchGenerator()
                           - useFaceshell() + usePatchFaceshell()
```

---

## Localized Fields

Sanity stores bilingual content as:
```json
[{ "_key": "id", "value": "Teks Indonesia" }, { "_key": "en", "value": "English text" }]
```

`LocalizedField` component renders two side-by-side inputs (🇮🇩 / 🇬🇧). On save, the API route reconstructs the array format before sending to Sanity. API routes accept flat objects like `{ id: "...", en: "..." }` and convert internally.

---

## Drag-to-Reorder

Applies to: Gallery, Testimoni, FAQ (all have an `order` integer field in Sanity).

**Library:** `@dnd-kit/core` + `@dnd-kit/sortable` (tree-shakeable, no heavy deps).

**Flow:**
1. User drags item to new position in list
2. Client recomputes `order` values for all affected items (increments of 10 to leave gaps)
3. Single `PATCH /api/cms/[type]/reorder` call — body: `[{ id, order }]` array
4. API route runs Sanity transaction (batch patch) to update all `order` fields atomically

`SortableList` wraps any list with drag handles (⠿ icon on left of each row). Disabled for Strava Orders and Waitlist.

---

## Design Patterns

- **Glass dark theme** — match existing 3PB Ops style (same as order/finance pages)
- **React Query** — all data fetching via hooks in `use-cms.ts`, consistent with existing `use-orders.ts`, `use-po.ts`
- **Optimistic UI** — not required for CMS (low frequency edits), show loading spinner on save
- **Error handling** — toast notification on save success/failure (same pattern as upload image in produk)
- **Image display** — use Sanity image URL builder (`@sanity/image-url`) for displaying existing images

---

## Implementation Order

1. `lib/sanity/` — client, types, queries
2. Env vars — add to `.env.deploy`, `.env.deploy.example`, `deploy.sh`
3. `shared/` components — `LocalizedField`, `ImageUpload`, `CollectionList`
4. API routes — start with read-only (GET all), then add mutations
5. `use-cms.ts` hooks
6. CMS components — singletons first (simpler), then collections
7. `CMSSidebar` + wire up `/landing/page.tsx`
8. Deploy & verify

---

## Out of Scope

- Product management (separate discussion)
- Global sidebar layout for the whole app (separate session)
- Preview of the live landing page within the dashboard
