# FilamentHarga Moving Average dari PO — Design Spec

**Goal:** Otomatis hitung rate `hargaPerGram` di FilamentHarga catalog berdasarkan moving average harga beli aktual dari spool yang diterima via PO.

**Architecture:** Saat PO di-receive (Spool baru dibuat dengan `hargaBeli`), sistem recompute `AVG(hargaBeli) / 1000` per `brand + material` dan upsert ke `FilamentHarga`. Ada juga tombol manual di Settings untuk force recompute semua. KalkulasiPlate sudah support memilih FilamentHarga — tidak perlu perubahan di sana.

**Tech Stack:** Prisma (SQLite), Next.js App Router, TypeScript

---

## 1. Formula

```
hargaPerGram = AVG(Spool.hargaBeli) / 1000
```

- Group by: `brand + material` (warna **tidak** ikut grouping)
- Hanya spool dengan `hargaBeli IS NOT NULL`
- Asumsi 1 roll = 1000g (standard)
- Kalau belum ada spool → FilamentHarga tidak dibuat/diubah; fallback ke rate default Config (300/g)

---

## 2. Schema Changes

Tambah 1 kolom di model `FilamentHarga`:

```prisma
model FilamentHarga {
  id           String @id @default(cuid())
  brand        String
  material     String
  hargaPerGram Float
  spoolCount   Int    @default(0)  // jumlah spool basis perhitungan; 0 = input manual
  @@unique([brand, material])
}
```

- `spoolCount > 0` → rate auto-computed dari PO
- `spoolCount == 0` → rate input manual (user bisa tetap override manual)

---

## 3. Service Function

Buat fungsi `recomputeFilamentHarga()` di `lib/filamen/` (atau `lib/kalkulator/`):

```ts
async function recomputeFilamentHarga(brandMaterialPairs?: { brand: string; material: string }[]) {
  // Jika pairs tidak diberikan → recompute semua
  const spools = await prisma.spool.findMany({
    where: {
      hargaBeli: { not: null },
      ...(brandMaterialPairs && {
        OR: brandMaterialPairs.map(p => ({ brand: p.brand, material: p.material }))
      })
    },
    select: { brand: true, material: true, hargaBeli: true }
  })

  // Group by brand + material
  const groups = new Map<string, { total: number; count: number; brand: string; material: string }>()
  for (const s of spools) {
    const key = `${s.brand}||${s.material}`
    const g = groups.get(key) ?? { total: 0, count: 0, brand: s.brand, material: s.material }
    g.total += s.hargaBeli!
    g.count++
    groups.set(key, g)
  }

  // Upsert FilamentHarga
  for (const g of groups.values()) {
    const hargaPerGram = g.total / g.count / 1000
    await prisma.filamentHarga.upsert({
      where: { brand_material: { brand: g.brand, material: g.material } },
      update: { hargaPerGram, spoolCount: g.count },
      create: { brand: g.brand, material: g.material, hargaPerGram, spoolCount: g.count },
    })
  }
}
```

---

## 4. Trigger Points

### A. Auto — saat PO received

Di `lib/po/service.ts`, fungsi `receivePO()`, setelah Spool records dibuat:

```ts
// Recompute hanya brand+material yang baru diterima
const pairs = filamentItems.map(i => ({ brand: i.brand!, material: i.material! }))
await recomputeFilamentHarga(pairs)
```

### B. Manual — API endpoint

`POST /api/settings/filament-harga/recompute`
- Auth required
- Panggil `recomputeFilamentHarga()` tanpa filter (semua)
- Return: `{ updated: number }` (jumlah FilamentHarga yang di-upsert)

---

## 5. UI — Settings FilamentHarga

Di `components/settings/FilamentHargaCard.tsx` (atau halaman settings yang ada):

- Tiap row FilamentHarga tampilkan badge:
  - `⚡ N spool` (warna indigo) kalau `spoolCount > 0`
  - `✏️ manual` (warna abu) kalau `spoolCount == 0`
- Tombol di header: **"🔄 Hitung ulang dari PO"**
  - Click → POST ke `/api/settings/filament-harga/recompute`
  - Show loading state + success "X rate diperbarui"

---

## 6. Out of Scope

- Spool dengan berat selain 1kg (asumsi 1000g flat)
- Per-warna rate (group hanya brand+material)
- History perubahan rate
- Rate berbeda per batch/tanggal pembelian
