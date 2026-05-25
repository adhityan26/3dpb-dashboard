# Invoice Diskon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah fitur diskon per item dan diskon global pada invoice, bisa input nominal (Rp) atau persen (%).

**Architecture:** Diskon disimpan di DB (kolom baru di `Quotation` dan `QuotationItem`). Service layer menghitung ulang `subtotal`, `subtotalProduk`, `total`. UI menampilkan toggle Rp/% dan summary breakdown diskon.

**Tech Stack:** Prisma (SQLite), Next.js App Router, TypeScript, React, Tanstack Query

---

## File Map

| File | Perubahan |
|------|-----------|
| `prisma/schema.prisma` | Tambah `diskonGlobal`, `diskonGlobalPct` di `Quotation`; `diskon`, `diskonPct` di `QuotationItem` |
| `prisma/migrations/20260524_invoice_diskon/migration.sql` | Buat migration file baru |
| `lib/invoice/types.ts` | Tambah field diskon di semua interface terkait |
| `lib/invoice/service.ts` | Update `toItemData`, `toQuotationData`, `listQuotations`, `createQuotation`, `updateQuotation` |
| `components/invoice/InvoiceForm.tsx` | Tambah diskon input per item + global diskon + summary |
| `components/invoice/InvoiceDetail.tsx` | Tampilkan diskon di view + edit mode |

---

## Task 1: Prisma Schema & Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260524000000_invoice_diskon/migration.sql`

- [ ] **Step 1: Tambah kolom diskon ke schema**

Edit `prisma/schema.prisma` — update model `Quotation`:
```prisma
model Quotation {
  id            String           @id @default(cuid())
  nomor         String           @unique
  buyerNama     String
  buyerContact  String?
  catatan       String?
  status        String           @default("DRAFT")
  tanggal       DateTime         @default(now())
  dueDate       DateTime?
  ongkir        Float            @default(0)
  diskonGlobal  Float            @default(0)   // nominal diskon global
  diskonGlobalPct Float?                        // persen jika input %; null jika input nominal
  shopeeOrderSn String?
  items         QuotationItem[]
  payments      InvoicePayment[]
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
}
```

Update model `QuotationItem`:
```prisma
model QuotationItem {
  id               String    @id @default(cuid())
  quotationId      String
  quotation        Quotation @relation(fields: [quotationId], references: [id], onDelete: Cascade)
  produkInternalId String?
  namaProduk       String
  qty              Int       @default(1)
  hargaPerUnit     Float
  channelHarga     String    @default("marketplace")
  catatan          String?
  diskon           Float     @default(0)   // nominal diskon per item
  diskonPct        Float?                  // persen jika input %; null jika input nominal
}
```

- [ ] **Step 2: Buat migration file**

Buat folder dan file: `prisma/migrations/20260524000000_invoice_diskon/migration.sql`
```sql
-- AddColumn diskon ke Quotation dan QuotationItem
ALTER TABLE "Quotation" ADD COLUMN "diskonGlobal" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN "diskonGlobalPct" REAL;
ALTER TABLE "QuotationItem" ADD COLUMN "diskon" REAL NOT NULL DEFAULT 0;
ALTER TABLE "QuotationItem" ADD COLUMN "diskonPct" REAL;
```

- [ ] **Step 3: Verify migration file dikenali Prisma**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx prisma migrate status
```

Expected: migration `20260524000000_invoice_diskon` muncul sebagai "pending".

- [ ] **Step 4: Apply migration ke dev DB lokal**

```bash
npx prisma migrate deploy
```

Expected: `1 migration applied` tanpa error.

- [ ] **Step 5: Generate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260524000000_invoice_diskon/
git commit -m "feat(db): add diskon fields to Quotation and QuotationItem"
```

---

## Task 2: Update Types

**Files:**
- Modify: `lib/invoice/types.ts`

- [ ] **Step 1: Update `QuotationItemData`**

```ts
export interface QuotationItemData {
  id: string
  quotationId: string
  produkInternalId: string | null
  namaProduk: string
  qty: number
  hargaPerUnit: number
  channelHarga: ChannelHarga
  catatan: string | null
  diskon: number           // nominal diskon per item (0 = tidak ada)
  diskonPct: number | null // persen jika input %; null jika input nominal
  subtotal: number         // qty * hargaPerUnit - diskon
}
```

- [ ] **Step 2: Update `QuotationData`**

```ts
export interface QuotationData {
  id: string
  nomor: string
  buyerNama: string
  buyerContact: string | null
  catatan: string | null
  status: QuotationStatus
  tanggal: string
  dueDate: string | null
  ongkir: number
  diskonGlobal: number           // nominal diskon global
  diskonGlobalPct: number | null // persen jika input %; null jika input nominal
  shopeeOrderSn: string | null
  items: QuotationItemData[]
  payments: InvoicePaymentData[]
  subtotalProduk: number  // Σ item.subtotal (setelah diskon item)
  total: number           // subtotalProduk - diskonGlobal + ongkir
  totalPaid: number
  sisaBayar: number
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 3: Update `QuotationItemInput`**

```ts
export interface QuotationItemInput {
  produkInternalId?: string | null
  namaProduk: string
  qty: number
  hargaPerUnit: number
  channelHarga: ChannelHarga
  catatan?: string | null
  diskon?: number        // default 0
  diskonPct?: number | null
}
```

- [ ] **Step 4: Update `QuotationInput` dan `UpdateQuotationInput`**

Tambah ke `QuotationInput`:
```ts
diskonGlobal?: number
diskonGlobalPct?: number | null
```

Tambah ke `UpdateQuotationInput`:
```ts
diskonGlobal?: number
diskonGlobalPct?: number | null
```

- [ ] **Step 5: Commit**

```bash
git add lib/invoice/types.ts
git commit -m "feat(types): add diskon fields to invoice types"
```

---

## Task 3: Update Service Layer

**Files:**
- Modify: `lib/invoice/service.ts`

- [ ] **Step 1: Update `toItemData`**

```ts
function toItemData(raw: any): QuotationItemData {
  const diskon = raw.diskon ?? 0
  return {
    id: raw.id,
    quotationId: raw.quotationId,
    produkInternalId: raw.produkInternalId ?? null,
    namaProduk: raw.namaProduk,
    qty: raw.qty,
    hargaPerUnit: raw.hargaPerUnit,
    channelHarga: raw.channelHarga as ChannelHarga,
    catatan: raw.catatan ?? null,
    diskon,
    diskonPct: raw.diskonPct ?? null,
    subtotal: raw.qty * raw.hargaPerUnit - diskon,
  }
}
```

- [ ] **Step 2: Update `toQuotationData`**

```ts
function toQuotationData(raw: any): QuotationData {
  const items = (raw.items ?? []).map(toItemData)
  const payments = (raw.payments ?? []).map(toPaymentData)
  const subtotalProduk = items.reduce((s: number, i: QuotationItemData) => s + i.subtotal, 0)
  const ongkir = raw.ongkir ?? 0
  const diskonGlobal = raw.diskonGlobal ?? 0
  const total = subtotalProduk - diskonGlobal + ongkir
  const totalPaid = payments.reduce((s: number, p: InvoicePaymentData) => s + p.jumlah, 0)
  return {
    id: raw.id,
    nomor: raw.nomor,
    buyerNama: raw.buyerNama,
    buyerContact: raw.buyerContact ?? null,
    catatan: raw.catatan ?? null,
    status: raw.status,
    tanggal: toIsoString(raw.tanggal)!,
    dueDate: toIsoString(raw.dueDate),
    ongkir,
    diskonGlobal,
    diskonGlobalPct: raw.diskonGlobalPct ?? null,
    shopeeOrderSn: raw.shopeeOrderSn ?? null,
    items,
    payments,
    subtotalProduk,
    total,
    totalPaid,
    sisaBayar: Math.max(0, total - totalPaid),
    createdAt: toIsoString(raw.createdAt)!,
    updatedAt: toIsoString(raw.updatedAt)!,
  }
}
```

- [ ] **Step 3: Update `listQuotations` — total calculation**

Di dalam `rows.map(raw => { ... })`, update kalkulasi total:
```ts
const subtotalProduk = (r.items ?? []).reduce((s: number, i: any) => s + (i.qty * i.hargaPerUnit - (i.diskon ?? 0)), 0)
const ongkir = r.ongkir ?? 0
const diskonGlobal = r.diskonGlobal ?? 0
const total = subtotalProduk - diskonGlobal + ongkir
```

Tambah `diskon: true` ke select di `listQuotations`:
```ts
items: { select: { qty: true, hargaPerUnit: true, diskon: true } },
```

- [ ] **Step 4: Update `createQuotation` — terima dan simpan diskon**

```ts
export async function createQuotation(input: QuotationInput): Promise<QuotationData> {
  const nomor = await generateNomor(input.tanggal)
  const raw = await (prisma.quotation.create as any)({
    data: {
      nomor,
      buyerNama: input.buyerNama.trim(),
      buyerContact: input.buyerContact?.trim() ?? null,
      catatan: input.catatan?.trim() ?? null,
      tanggal: input.tanggal ? new Date(input.tanggal) : new Date(),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      ongkir: input.ongkir ?? 0,
      diskonGlobal: input.diskonGlobal ?? 0,
      diskonGlobalPct: input.diskonGlobalPct ?? null,
      shopeeOrderSn: input.shopeeOrderSn?.trim() ?? null,
      items: {
        create: input.items.map(item => ({
          produkInternalId: item.produkInternalId ?? null,
          namaProduk: item.namaProduk,
          qty: item.qty,
          hargaPerUnit: item.hargaPerUnit,
          channelHarga: item.channelHarga,
          catatan: item.catatan?.trim() ?? null,
          diskon: item.diskon ?? 0,
          diskonPct: item.diskonPct ?? null,
        })),
      },
    },
    include: FULL_INCLUDE,
  })
  return toQuotationData(raw)
}
```

- [ ] **Step 5: Update `updateQuotation` — terima dan simpan diskon**

Tambah di blok `updateData`:
```ts
if (input.diskonGlobal !== undefined) updateData.diskonGlobal = input.diskonGlobal
if (input.diskonGlobalPct !== undefined) updateData.diskonGlobalPct = input.diskonGlobalPct
```

Update bagian `items.create` untuk include diskon:
```ts
updateData.items = {
  create: input.items.map(item => ({
    produkInternalId: item.produkInternalId ?? null,
    namaProduk: item.namaProduk,
    qty: item.qty,
    hargaPerUnit: item.hargaPerUnit,
    channelHarga: item.channelHarga,
    catatan: item.catatan?.trim() ?? null,
    diskon: item.diskon ?? 0,
    diskonPct: item.diskonPct ?? null,
  })),
}
```

- [ ] **Step 6: Verify TypeScript compile**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors (atau hanya warning, bukan error).

- [ ] **Step 7: Commit**

```bash
git add lib/invoice/service.ts
git commit -m "feat(service): update invoice service to compute diskon in totals"
```

---

## Task 4: Update InvoiceForm UI

**Files:**
- Modify: `components/invoice/InvoiceForm.tsx`

- [ ] **Step 1: Extend `LineItem` interface dan state**

Update `LineItem` interface (tambah setelah `QuotationItemInput` extension):
```ts
interface LineItem extends QuotationItemInput {
  key: string
  diskon: number
  diskonPct: number | null
  diskonMode: 'Rp' | '%'  // local UI state only
}
```

Tambah state untuk global diskon di komponen:
```ts
const [diskonGlobal, setDiskonGlobal] = useState(0)
const [diskonGlobalPct, setDiskonGlobalPct] = useState<number | null>(null)
const [diskonGlobalMode, setDiskonGlobalMode] = useState<'Rp' | '%'>('Rp')
const [diskonGlobalInput, setDiskonGlobalInput] = useState("") // raw input string
```

Update `addFromKatalog` dan `addBlank` untuk include diskon defaults:
```ts
// di addFromKatalog, tambah ke object:
diskon: 0,
diskonPct: null,
diskonMode: 'Rp',

// di addBlank, tambah ke object:
diskon: 0,
diskonPct: null,
diskonMode: 'Rp',
```

- [ ] **Step 2: Tambah helper untuk konversi diskon**

Tambah fungsi di atas komponen:
```ts
function parseDiskonInput(input: string, mode: 'Rp' | '%', baseAmount: number): { diskon: number; diskonPct: number | null } {
  const val = parseFloat(input) || 0
  if (mode === '%') {
    const pct = Math.min(100, Math.max(0, val))
    return { diskon: Math.round(baseAmount * pct / 100), diskonPct: pct }
  }
  return { diskon: Math.round(Math.max(0, val)), diskonPct: null }
}
```

- [ ] **Step 3: Update total computation (useMemo)**

```ts
const subtotalProduk = useMemo(
  () => items.reduce((s, i) => s + i.qty * i.hargaPerUnit - i.diskon, 0),
  [items]
)
const totalDiskonItem = useMemo(
  () => items.reduce((s, i) => s + i.diskon, 0),
  [items]
)
const total = useMemo(
  () => subtotalProduk - diskonGlobal,
  [subtotalProduk, diskonGlobal]
)
```

(Hapus `const total = useMemo(...)` yang lama)

- [ ] **Step 4: Update per-item row UI**

Ganti grid template dan tambah diskon input. Ganti blok `{items.map(item => (...))}`:
```tsx
{items.map(item => (
  <div key={item.key} className="space-y-1">
    <div className="grid gap-2 items-center"
         style={{ gridTemplateColumns: "1fr 70px 110px 28px" }}>
      <input type="text" value={item.namaProduk}
        onChange={e => updateItem(item.key, { namaProduk: e.target.value })}
        placeholder="Nama produk"
        className="glass-input h-9 rounded-[8px] px-3 text-xs" />
      <input type="number" min="1" value={item.qty}
        onChange={e => updateItem(item.key, { qty: parseInt(e.target.value) || 1 })}
        className="glass-input h-9 rounded-[8px] px-3 text-xs" />
      <input type="number" min="0" value={item.hargaPerUnit || ""}
        onChange={e => updateItem(item.key, { hargaPerUnit: parseInt(e.target.value) || 0 })}
        placeholder="Harga/unit"
        className="glass-input h-9 rounded-[8px] px-3 text-xs" />
      <button onClick={() => removeItem(item.key)}
        className="h-9 w-7 rounded-[6px] flex items-center justify-center text-xs"
        style={{ color: "#f87171", background: "rgba(239,68,68,0.08)" }}>✕</button>
    </div>
    {/* Diskon per item */}
    <div className="flex items-center gap-2 pl-1">
      <span className="text-[10px] g-t5">Diskon:</span>
      <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--g-inner-border)" }}>
        {(['Rp', '%'] as const).map(m => (
          <button key={m} onClick={() => {
            const base = item.qty * item.hargaPerUnit
            const newMode = m
            // recalc diskon when switching mode
            if (newMode === '%' && item.diskon > 0 && base > 0) {
              const pct = Math.round(item.diskon / base * 1000) / 10
              updateItem(item.key, { diskonMode: newMode, diskonPct: pct })
            } else {
              updateItem(item.key, { diskonMode: newMode })
            }
          }}
            className="px-2 py-0.5 text-[9px] font-medium transition-colors"
            style={item.diskonMode === m
              ? { background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }
              : { background: "transparent", color: "var(--g-t4)" }}>
            {m}
          </button>
        ))}
      </div>
      <input
        type="number" min="0"
        value={item.diskonMode === '%' ? (item.diskonPct ?? 0) : (item.diskon || "")}
        onChange={e => {
          const base = item.qty * item.hargaPerUnit
          const { diskon, diskonPct } = parseDiskonInput(e.target.value, item.diskonMode, base)
          updateItem(item.key, { diskon, diskonPct })
        }}
        placeholder="0"
        className="glass-input h-7 w-20 rounded-[6px] px-2 text-xs" />
      {item.diskon > 0 && (
        <span className="text-[10px] g-t4">= -{fmt(item.diskon)}</span>
      )}
      <span className="text-[10px] g-t3 ml-auto">{fmt(item.qty * item.hargaPerUnit - item.diskon)}</span>
    </div>
  </div>
))}
```

- [ ] **Step 5: Update summary section (Total box)**

Ganti blok total box:
```tsx
{items.length > 0 && (
  <div className="rounded-[10px] overflow-hidden"
       style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
    <div className="px-4 py-3 space-y-2">
      {/* Subtotal produk */}
      <div className="flex justify-between items-center">
        <span className="text-xs g-t3">Subtotal produk</span>
        <span className="text-xs g-t2">{fmt(subtotalProduk + totalDiskonItem)}</span>
      </div>
      {/* Diskon item */}
      {totalDiskonItem > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-xs g-t4">- Diskon item</span>
          <span className="text-xs" style={{ color: "#f87171" }}>-{fmt(totalDiskonItem)}</span>
        </div>
      )}
      {/* Diskon global */}
      <div className="flex justify-between items-center gap-3">
        <span className="text-xs g-t3 shrink-0">- Diskon global</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--g-inner-border)" }}>
            {(['Rp', '%'] as const).map(m => (
              <button key={m} onClick={() => {
                setDiskonGlobalMode(m)
                setDiskonGlobalInput("")
                setDiskonGlobal(0)
                setDiskonGlobalPct(null)
              }}
                className="px-2 py-0.5 text-[9px] font-medium transition-colors"
                style={diskonGlobalMode === m
                  ? { background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }
                  : { background: "transparent", color: "var(--g-t4)" }}>
                {m}
              </button>
            ))}
          </div>
          <input
            type="number" min="0"
            value={diskonGlobalInput}
            onChange={e => {
              setDiskonGlobalInput(e.target.value)
              const { diskon, diskonPct } = parseDiskonInput(e.target.value, diskonGlobalMode, subtotalProduk)
              setDiskonGlobal(diskon)
              setDiskonGlobalPct(diskonPct)
            }}
            placeholder="0"
            className="glass-input h-7 w-24 rounded-[6px] px-2 text-xs" />
          {diskonGlobal > 0 && diskonGlobalMode === '%' && (
            <span className="text-[10px] g-t4">= -{fmt(diskonGlobal)}</span>
          )}
        </div>
      </div>
      {/* Total */}
      <div className="flex justify-between items-center pt-2"
           style={{ borderTop: "1px solid rgba(99,102,241,0.15)" }}>
        <span className="text-xs font-semibold" style={{ color: "rgba(165,180,252,0.7)" }}>TOTAL</span>
        <span className="text-base font-bold" style={{ color: "#a5b4fc" }}>{fmt(total)}</span>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Update `handleSave` — pass diskon ke mutation**

```ts
const result = await createMut.mutateAsync({
  tanggal: tanggal || null,
  buyerNama: buyerNama.trim(),
  buyerContact: buyerContact.trim() || null,
  catatan: catatan.trim() || null,
  dueDate: dueDate || null,
  shopeeOrderSn: orderPrefill?.shopeeOrderSn ?? null,
  diskonGlobal,
  diskonGlobalPct,
  items: items.map(({ key: _k, diskonMode: _dm, ...rest }) => rest),
})
```

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add components/invoice/InvoiceForm.tsx
git commit -m "feat(ui): add diskon input per item and global diskon in InvoiceForm"
```

---

## Task 5: Update InvoiceDetail — View & Edit Mode

**Files:**
- Modify: `components/invoice/InvoiceDetail.tsx`

- [ ] **Step 1: Tambah edit state untuk diskon**

Di bagian state declarations (setelah `editBuyerContact`):
```ts
const [editDiskonGlobal, setEditDiskonGlobal] = useState(0)
const [editDiskonGlobalPct, setEditDiskonGlobalPct] = useState<number | null>(null)
const [editDiskonGlobalMode, setEditDiskonGlobalMode] = useState<'Rp' | '%'>('Rp')
const [editDiskonGlobalInput, setEditDiskonGlobalInput] = useState("")
```

Extend `EditItem` interface:
```ts
interface EditItem extends QuotationItemInput {
  key: string
  diskon: number
  diskonPct: number | null
  diskonMode: 'Rp' | '%'
}
```

- [ ] **Step 2: Sync edit state dari invoice data**

Di `useEffect` yang sync edit state, tambah:
```ts
setEditDiskonGlobal(inv.diskonGlobal ?? 0)
setEditDiskonGlobalPct(inv.diskonGlobalPct ?? null)
setEditDiskonGlobalMode(inv.diskonGlobalPct != null ? '%' : 'Rp')
setEditDiskonGlobalInput(
  inv.diskonGlobalPct != null ? String(inv.diskonGlobalPct) :
  inv.diskonGlobal > 0 ? String(inv.diskonGlobal) : ""
)
```

Update `setEditItems` untuk map diskon dari items:
```ts
setEditItems(inv.items.map(i => ({
  key: nextEditKey(),
  produkInternalId: i.produkInternalId,
  namaProduk: i.namaProduk,
  qty: i.qty,
  hargaPerUnit: i.hargaPerUnit,
  channelHarga: i.channelHarga,
  catatan: i.catatan ?? null,
  diskon: i.diskon,
  diskonPct: i.diskonPct ?? null,
  diskonMode: i.diskonPct != null ? '%' : 'Rp',
})))
```

- [ ] **Step 3: Tambah helper parseDiskonInput di InvoiceDetail**

Tambah fungsi yang sama seperti di InvoiceForm (sebelum komponen):
```ts
function parseDiskonInput(input: string, mode: 'Rp' | '%', baseAmount: number): { diskon: number; diskonPct: number | null } {
  const val = parseFloat(input) || 0
  if (mode === '%') {
    const pct = Math.min(100, Math.max(0, val))
    return { diskon: Math.round(baseAmount * pct / 100), diskonPct: pct }
  }
  return { diskon: Math.round(Math.max(0, val)), diskonPct: null }
}
```

- [ ] **Step 4: Update `handleSaveEdit` — pass diskon**

Cari panggilan `updateMut.mutateAsync` di fungsi save edit mode, tambah:
```ts
diskonGlobal: editDiskonGlobal,
diskonGlobalPct: editDiskonGlobalPct,
items: editItems.map(({ key: _k, diskonMode: _dm, ...rest }) => rest),
```

- [ ] **Step 5: Tampilkan diskon di view mode (bukan edit)**

Cari bagian summary / breakdown total di view mode. Tambah baris diskon sebelum total:
```tsx
{/* Subtotal mentah sebelum diskon — hanya tampil jika ada diskon */}
{(inv.diskonGlobal > 0 || inv.items.some(i => i.diskon > 0)) && (
  <div className="flex justify-between text-sm">
    <span className="g-t3">Subtotal produk</span>
    <span className="g-t2">{fmt(inv.subtotalProduk + inv.items.reduce((s, i) => s + i.diskon, 0))}</span>
  </div>
)}
{inv.items.some(i => i.diskon > 0) && (
  <div className="flex justify-between text-sm">
    <span className="g-t4">- Diskon item</span>
    <span style={{ color: "#f87171" }}>-{fmt(inv.items.reduce((s, i) => s + i.diskon, 0))}</span>
  </div>
)}
{inv.diskonGlobal > 0 && (
  <div className="flex justify-between text-sm">
    <span className="g-t4">
      - Diskon global{inv.diskonGlobalPct != null ? ` (${inv.diskonGlobalPct}%)` : ""}
    </span>
    <span style={{ color: "#f87171" }}>-{fmt(inv.diskonGlobal)}</span>
  </div>
)}
```

- [ ] **Step 6: Tampilkan diskon di edit mode per-item row**

Di edit mode, per item row, tambah diskon input (sama seperti InvoiceForm Task 4 Step 4 — copy pattern yang sama dengan `editItems` dan fungsi `updateEditItem`).

Pastikan ada fungsi `updateEditItem`:
```ts
function updateEditItem(key: string, patch: Partial<EditItem>) {
  setEditItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i))
}
```

Tambah diskon global input di edit mode summary (sama seperti InvoiceForm Task 4 Step 5 tapi binding ke `editDiskonGlobal*` state).

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add components/invoice/InvoiceDetail.tsx
git commit -m "feat(ui): show and edit diskon in InvoiceDetail view and edit mode"
```

---

## Task 6: Deploy ke Homelab

**Files:** none (deploy only)

- [ ] **Step 1: Build & deploy**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
./deploy.sh build 2>&1 | tail -30
```

Expected: Container `shopee-dashboard` up, migration applied.

- [ ] **Step 2: Verify container running**

```bash
docker -H tcp://192.168.88.113:2375 ps --filter name=shopee
docker -H tcp://192.168.88.113:2375 logs --tail 20 shopee-dashboard
```

Expected: Status `Up`, log menampilkan `No pending migrations` atau `1 migration applied`.

- [ ] **Step 3: Smoke test**

Buka `https://dashboard.3dprintingbandung.my.id` → buat invoice baru → tambah item dengan diskon → cek total terhitung benar.
