# Sidebar Mobile Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buat sidebar di halaman `/landing` dan `/produk` bisa disembunyikan di mobile sehingga konten punya layar penuh.

**Architecture:** Buat shared `SidebarDrawerShell` wrapper yang handle positioning dan overlay — sidebar components (`CMSSidebar`, `ProdukSidebar`) tidak perlu diubah. Setiap page mengangkat state `sidebarOpen` dan menutup drawer otomatis saat user ganti section.

**Tech Stack:** React (useState), Tailwind CSS responsive classes (md breakpoint), lucide-react (Menu icon), Next.js client components.

---

## File Structure

| File | Action | Keterangan |
|---|---|---|
| `components/layout/SidebarDrawerShell.tsx` | CREATE | Wrapper component: mobile drawer logic, toggle button, backdrop |
| `app/(dashboard)/landing/page.tsx` | MODIFY | Tambah `sidebarOpen` state, wrap CMSSidebar dengan shell |
| `app/(dashboard)/produk/page.tsx` | MODIFY | Sama untuk ProdukSidebar |

---

### Task 1: Buat `SidebarDrawerShell` component

**Files:**
- Create: `components/layout/SidebarDrawerShell.tsx`

Context: Wrapper yang membungkus sidebar. Di mobile, sidebar jadi `fixed` overlay (keluar dari flex flow sehingga konten dapat full width). Di desktop (`md+`), sidebar kembali `static` seperti biasa. Shell juga render toggle button dan backdrop.

- [ ] **Step 1: Buat file `components/layout/SidebarDrawerShell.tsx`**

```tsx
"use client"

import { ReactNode } from "react"
import { Menu } from "lucide-react"

interface SidebarDrawerShellProps {
  open: boolean
  onOpen: () => void
  onClose: () => void
  children: ReactNode
}

export function SidebarDrawerShell({ open, onOpen, onClose, children }: SidebarDrawerShellProps) {
  return (
    <>
      {/* Toggle button — mobile only, hidden when drawer is open */}
      {!open && (
        <button
          onClick={onOpen}
          className="fixed top-3 left-3 z-40 md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80"
          style={{
            background: "rgba(99,102,241,0.2)",
            color: "#a5b4fc",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
          aria-label="Buka menu"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}

      {/* Backdrop — mobile only, visible when open */}
      {open && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={onClose}
        />
      )}

      {/* Sidebar container:
          - Mobile closed: fixed off-screen to the left (-translate-x-full), out of flex flow
          - Mobile open:   fixed, slides in (translate-x-0), overlays content
          - Desktop:       static, in-flow (translate-x-0 always)
      */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50",
          "md:static md:inset-auto",
          "transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {children}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verifikasi TypeScript compile**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | grep "SidebarDrawerShell" || echo "no errors in SidebarDrawerShell"
```

Expected: tidak ada error dari file baru ini.

- [ ] **Step 3: Commit**

```bash
git add components/layout/SidebarDrawerShell.tsx
git commit -m "feat: add SidebarDrawerShell for mobile drawer behavior"
```

---

### Task 2: Wire SidebarDrawerShell ke `/landing` page

**Files:**
- Modify: `app/(dashboard)/landing/page.tsx`

Context: File ini saat ini merender `<CMSSidebar active={...} onChange={setSection} />` langsung dalam flex container. Kita perlu: (1) tambah `sidebarOpen` state, (2) bungkus CMSSidebar dengan SidebarDrawerShell, (3) `setSection` tutup drawer setelah ganti section.

Current code di `LandingPageInner` (baris 42–58):
```tsx
return (
  <div className="flex min-h-screen -mx-4 -mt-4 md:-mx-6 md:-mt-6">
    <CMSSidebar active={activeSection} onChange={setSection} />
    <div className="flex-1 overflow-auto">
      ...
    </div>
  </div>
)
```

- [ ] **Step 1: Tambah import dan state di `LandingPageInner`**

Di baris atas file, tambah import:
```tsx
import { SidebarDrawerShell } from "@/components/layout/SidebarDrawerShell"
```

Di dalam `function LandingPageInner()`, setelah baris `const activeSection: CmsSection = ...`, tambah:
```tsx
const [sidebarOpen, setSidebarOpen] = useState(false)
```

- [ ] **Step 2: Update `setSection` agar menutup drawer**

Ganti fungsi `setSection` yang ada:
```tsx
// BEFORE:
function setSection(section: CmsSection) {
  const params = new URLSearchParams(searchParams.toString())
  params.set("section", section)
  router.replace(`?${params.toString()}`, { scroll: false })
}

// AFTER:
function setSection(section: CmsSection) {
  const params = new URLSearchParams(searchParams.toString())
  params.set("section", section)
  router.replace(`?${params.toString()}`, { scroll: false })
  setSidebarOpen(false)
}
```

- [ ] **Step 3: Bungkus `CMSSidebar` dengan `SidebarDrawerShell`**

Ganti:
```tsx
<CMSSidebar active={activeSection} onChange={setSection} />
```

Dengan:
```tsx
<SidebarDrawerShell
  open={sidebarOpen}
  onOpen={() => setSidebarOpen(true)}
  onClose={() => setSidebarOpen(false)}
>
  <CMSSidebar active={activeSection} onChange={setSection} />
</SidebarDrawerShell>
```

- [ ] **Step 4: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit 2>&1 | grep "landing" || echo "no errors in landing page"
```

Expected: tidak ada error.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/landing/page.tsx
git commit -m "feat: wire SidebarDrawerShell to landing page CMS"
```

---

### Task 3: Wire SidebarDrawerShell ke `/produk` page

**Files:**
- Modify: `app/(dashboard)/produk/page.tsx`

Context: Sama seperti Task 2 tapi untuk `ProdukSidebar`. File ini merender `<ProdukSidebar active={produkTab} onChange={setProdukTab} />` di baris 98. Fungsi `setProdukTab` perlu menutup drawer setelah ganti tab.

- [ ] **Step 1: Tambah import dan state di `ProdukPageInner`**

Di baris atas file, tambah import:
```tsx
import { SidebarDrawerShell } from "@/components/layout/SidebarDrawerShell"
```

Di dalam `function ProdukPageInner()`, setelah baris `const produkTab: ProdukTab = ...`, tambah:
```tsx
const [sidebarOpen, setSidebarOpen] = useState(false)
```

(`useState` sudah diimport di baris 1 — tidak perlu tambah import lagi.)

- [ ] **Step 2: Update `setProdukTab` agar menutup drawer**

Ganti:
```tsx
// BEFORE:
function setProdukTab(tab: ProdukTab) {
  const params = new URLSearchParams(searchParams.toString())
  params.set("tab", tab)
  router.replace(`?${params.toString()}`, { scroll: false })
}

// AFTER:
function setProdukTab(tab: ProdukTab) {
  const params = new URLSearchParams(searchParams.toString())
  params.set("tab", tab)
  router.replace(`?${params.toString()}`, { scroll: false })
  setSidebarOpen(false)
}
```

- [ ] **Step 3: Bungkus `ProdukSidebar` dengan `SidebarDrawerShell`**

Ganti:
```tsx
<ProdukSidebar active={produkTab} onChange={setProdukTab} />
```

Dengan:
```tsx
<SidebarDrawerShell
  open={sidebarOpen}
  onOpen={() => setSidebarOpen(true)}
  onClose={() => setSidebarOpen(false)}
>
  <ProdukSidebar active={produkTab} onChange={setProdukTab} />
</SidebarDrawerShell>
```

- [ ] **Step 4: Verifikasi TypeScript compile**

```bash
npx tsc --noEmit 2>&1 | grep "produk" || echo "no errors in produk page"
```

Expected: tidak ada error.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/produk/page.tsx
git commit -m "feat: wire SidebarDrawerShell to produk page"
```

---

### Task 4: Build + deploy + smoke test

**Files:** none (verification only)

- [ ] **Step 1: Build production**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` tanpa error TypeScript atau module not found.

- [ ] **Step 2: Deploy**

```bash
bash deploy.sh 2>&1 | tail -10
```

Expected: container restart berhasil.

- [ ] **Step 3: Smoke test manual di browser mobile/devtools**

Buka DevTools → Toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M) → pilih device mobile.

Cek `/landing`:
- [ ] Sidebar tidak terlihat, konten full width ✓
- [ ] Ada tombol ☰ di pojok kiri atas ✓
- [ ] Tap ☰ → sidebar slide-in dari kiri ✓
- [ ] Backdrop gelap muncul di belakang sidebar ✓
- [ ] Tap backdrop → sidebar tutup ✓
- [ ] Pilih section lain di sidebar → sidebar tutup otomatis, section berganti ✓

Cek `/produk`:
- [ ] Hal yang sama: ☰, drawer, backdrop, auto-close saat pilih tab ✓

Cek desktop (lebar ≥ 768px):
- [ ] Sidebar tetap muncul statis di kiri, tombol ☰ tidak ada ✓
- [ ] Tidak ada perubahan tampilan vs sebelumnya ✓
