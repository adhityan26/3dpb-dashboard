# Sidebar Mobile Drawer Design

## Goal

Sidebar di halaman `/landing` dan `/produk` tidak bisa disembunyikan di mobile, sehingga konten tertutup. Tambahkan mobile drawer behavior: sidebar tersembunyi by default di mobile, muncul sebagai overlay ketika user tap tombol ☰.

## Architecture

Buat satu shared wrapper `SidebarDrawerShell` yang mengatur semua logic mobile drawer. Kedua halaman menggunakan wrapper ini. `CMSSidebar` dan `ProdukSidebar` tidak perlu diubah — mereka hanya menjadi `children` dari shell.

Setiap halaman mengangkat state `sidebarOpen` sehingga bisa auto-close sidebar saat user berpindah section.

## Tech Stack

React (useState), Tailwind CSS responsive classes, Next.js client components.

---

## Components

### `components/layout/SidebarDrawerShell.tsx` (NEW)

**Props:**
```ts
{
  open: boolean
  onOpen: () => void
  onClose: () => void
  children: ReactNode
}
```

**Desktop (`md+`):** Render `children` langsung tanpa modifikasi — shell tidak mempengaruhi layout.

**Mobile (< `md`):**
- Render tombol `☰` fixed di `top-3 left-3 z-40`, styled seperti elemen dashboard (background `rgba(99,102,241,0.2)`, color `#a5b4fc`). Hanya muncul saat `!open`.
- Saat `open`:
  - `children` di-render sebagai `fixed inset-y-0 left-0 z-50` (sidebar jadi overlay, keluar dari flex flow)
  - Backdrop `fixed inset-0 z-40 bg-black/60` di belakang sidebar, tap untuk tutup
  - Sidebar masuk dengan CSS transition `translate-x-0`, keluar dengan `-translate-x-full`

### `app/(dashboard)/landing/page.tsx` (MODIFY)

- Tambah state: `const [sidebarOpen, setSidebarOpen] = useState(false)`
- Fungsi `setSection` memanggil `setSidebarOpen(false)` setelah update URL
- Wrap `<CMSSidebar>` dengan `<SidebarDrawerShell open={sidebarOpen} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)}>`

### `app/(dashboard)/produk/page.tsx` (MODIFY)

- Tambah state: `const [sidebarOpen, setSidebarOpen] = useState(false)`
- Fungsi `setProdukTab` memanggil `setSidebarOpen(false)` setelah update URL
- Wrap `<ProdukSidebar>` dengan `<SidebarDrawerShell open={sidebarOpen} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)}>`

---

## Behavior Detail

| Kondisi | Tampilan |
|---|---|
| Mobile, sidebar tertutup | Konten full width, tombol ☰ fixed top-left |
| Mobile, sidebar terbuka | Drawer overlay dari kiri, backdrop gelap di belakang |
| Tap backdrop | Drawer tutup, section tidak berubah |
| Pilih menu di drawer | Section berganti, drawer otomatis tutup |
| Desktop (md+) | Sidebar static in-flow seperti semula, tombol ☰ tidak muncul |

## Out of Scope

- Animasi slide (cukup dengan Tailwind transition)
- Persist state open/closed di localStorage
- Sidebar collapse/icon-only mode
- Halaman lain selain `/landing` dan `/produk`
