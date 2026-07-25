# Fase 1b-4 — Simpan hasil kalkulasi + Riwayat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Pro (paidCore) users in `apps/saas` (Slizebiz) save a kalkulasi (name + all inputs + a frozen price snapshot) to local IndexedDB, browse it in a dedicated Riwayat page, and reopen it for editing via `/kalkulator/[id]`. Free users see zero behavior change.

**Architecture:** Pure client-side persistence — no server/API/Prisma involved. A shared IndexedDB opener (`lib/store/db.ts`) owns the single `slizebiz-local` database (bumped v1→v2, additive), a new `lib/store/kalkulasi-history.ts` CRUD module scoped by `userId`, and three route-level changes: `/` becomes Riwayat for Pro (unchanged for Free), `/kalkulator` is a fresh empty form, `/kalkulator/[id]` loads and edits a saved record. `ResultPanel`'s existing disabled "Simpan" button gets wired up.

**Tech Stack:** Next.js 16 App Router (React 19, Server Components for pages), `idb` (already a dependency), vitest + `@testing-library/react` + `fake-indexeddb/auto` for tests, TanStack Query NOT used here (matches existing `local-settings.ts` pattern — plain async functions, no query cache).

## Global Constraints

- Node 22 required for every shell command in this plan: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` first (default `node` on this machine is a broken v10).
- Run tests/build from the worktree `/Users/adhityatangahu/Documents/trees/saas-1b4-riwayat` on branch `feat/saas-1b4-riwayat-kalkulasi` — this is an isolated worktree, safe to commit directly to this branch (not `master`).
- **Never `git add -A` / `git add .`** — every commit step below lists exact paths; stage only those.
- **Never `crypto.randomUUID()` directly** — always `newId()` from `@/lib/id` (breaks on the homelab's non-secure `http://<IP>` origin).
- **Formula core `packages/kalkulator-core` must NOT change.**
- Tier is called **"Pro"** in all UI copy — never "Beli".
- IndexedDB database name stays `slizebiz-local`; the version bump 1→2 must be **additive** (existing `settings` store and its data must survive untouched for users whose browser DB is still at version 1).
- Free tier (`paidCore=false`): **zero behavior change** — `/` still renders the calculator directly, no "Nama kalkulasi" field, no Simpan/Update button rendered at all (not merely hidden/disabled).
- Routes are exactly `/kalkulator` (new) and `/kalkulator/[id]` (edit) — no `/kalkulator/baru`.
- Price snapshot is **frozen at save time** — reopening a record for editing does NOT recompute against live catalog rates; the visible strategi/price only changes if the user edits inputs and saves again (or explicitly hits "🔄 Refresh tarif", which only reloads catalog `settings`, not the saved snapshot).
- Delete is a hard delete, no undo, gated by `window.confirm` in the UI.
- No pagination in Riwayat v1. Duplicate-kalkulasi is explicitly out of scope.
- Deploy is gated — this plan does not deploy; deployment happens only on a later explicit user request.

---

### Task 1: Shared IndexedDB opener — bump `slizebiz-local` to v2

**Files:**
- Create: `apps/saas/lib/store/db.ts`
- Create: `apps/saas/lib/store/db.test.ts`
- Modify: `apps/saas/lib/store/local-settings.ts`

**Interfaces:**
- Produces: `openLocalDb(): Promise<IDBPDatabase>`, `DB_NAME: string` — both exported from `apps/saas/lib/store/db.ts`, consumed by Task 2's `kalkulasi-history.ts` and by the modified `local-settings.ts`.

- [ ] **Step 1: Write the failing test for the shared opener**

Create `apps/saas/lib/store/db.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { openLocalDb, DB_NAME } from "./db";

beforeEach(async () => {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe("db shared opener", () => {
  it(
    "membuat store settings & kalkulasi + index by-userId",
    async () => {
      const database = await openLocalDb();
      expect(database.objectStoreNames.contains("settings")).toBe(true);
      expect(database.objectStoreNames.contains("kalkulasi")).toBe(true);
      const tx = database.transaction("kalkulasi", "readonly");
      expect(tx.store.indexNames.contains("by-userId")).toBe(true);
      database.close();
    },
    10000
  );

  it(
    "upgrade dari DB versi 1 (store settings sudah ada + berisi data) tetap tambah kalkulasi tanpa merusak data lama",
    async () => {
      const { openDB } = await import("idb");
      const v1 = await openDB(DB_NAME, 1, {
        upgrade(d) {
          d.createObjectStore("settings", { keyPath: "userId" });
        },
      });
      await v1.put("settings", { userId: "u1", settings: { mesinPerJam: 9999 } });
      v1.close();

      const database = await openLocalDb();
      expect(database.objectStoreNames.contains("kalkulasi")).toBe(true);
      const rec = await database.get("settings", "u1");
      expect((rec as { settings: { mesinPerJam: number } }).settings.mesinPerJam).toBe(9999);
      database.close();
    },
    10000
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && npx vitest run lib/store/db.test.ts`
Expected: FAIL — `openLocalDb`/`DB_NAME` not defined (module `./db` doesn't exist yet).

- [ ] **Step 3: Write the shared opener**

Create `apps/saas/lib/store/db.ts`:

```ts
import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "slizebiz-local";
export const DB_VERSION = 2;

/** Satu opener bersama untuk seluruh store lokal (settings, kalkulasi, ...) —
 *  upgrade idempoten per-store (cek objectStoreNames.contains) supaya aman
 *  dipanggil dari modul manapun tanpa peduli urutan/versi DB yang ada sekarang. */
export async function openLocalDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("settings")) {
        d.createObjectStore("settings", { keyPath: "userId" });
      }
      if (!d.objectStoreNames.contains("kalkulasi")) {
        const store = d.createObjectStore("kalkulasi", { keyPath: "id" });
        store.createIndex("by-userId", "userId");
      }
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/store/db.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Point `local-settings.ts` at the shared opener**

Modify `apps/saas/lib/store/local-settings.ts` — replace the top of the file (imports + local `db()`):

```ts
import { openLocalDb } from "./db";
import {
  DEFAULT_LOCAL_SETTINGS,
  type LocalSettings,
} from "@/lib/kalkulator/local-settings";

const STORE = "settings";

async function db() {
  return openLocalDb();
}
```

Everything below `db()` in that file (`loadSettings`, `saveSettings`, `resetSettings`) stays exactly as-is — they already call `db()` and reference `STORE`, both of which still exist with the same names.

- [ ] **Step 6: Run the existing local-settings tests to confirm no regression**

Run: `npx vitest run lib/store/local-settings.test.ts lib/store/db.test.ts`
Expected: PASS — all 5 pre-existing `local-settings.test.ts` cases plus the 2 new `db.test.ts` cases green. This proves the v1→v2 bump didn't break the existing settings store.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/lib/store/db.ts apps/saas/lib/store/db.test.ts apps/saas/lib/store/local-settings.ts
git commit -m "feat(saas): shared IndexedDB opener, bump slizebiz-local to v2"
```

---

### Task 2: `kalkulasi-history.ts` — CRUD data layer

**Files:**
- Create: `apps/saas/lib/store/kalkulasi-history.ts`
- Create: `apps/saas/lib/store/kalkulasi-history.test.ts`

**Interfaces:**
- Consumes: `openLocalDb()`, `DB_NAME` from `./db` (Task 1); `PlateRow` from `@/components/PlateInput`; `KomponenRow, LaborRow` from `@/lib/kalkulator/compose`; `MarginTier, HasilKalkulasiV2` from `@3pb/kalkulator-core`; `Strategi` from `@/lib/kalkulator/compute`.
- Produces: `KalkulasiInput`, `KalkulasiSnapshot`, `KalkulasiRecord` types; `listKalkulasi(userId): Promise<KalkulasiRecord[]>`, `getKalkulasi(userId, id): Promise<KalkulasiRecord | null>`, `putKalkulasi(record): Promise<void>`, `deleteKalkulasi(userId, id): Promise<void>` — all consumed by Task 4 (`Calculator.tsx`) and Task 5 (`RiwayatList.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `apps/saas/lib/store/kalkulasi-history.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { DB_NAME } from "./db";
import {
  listKalkulasi,
  getKalkulasi,
  putKalkulasi,
  deleteKalkulasi,
  type KalkulasiRecord,
} from "./kalkulasi-history";

beforeEach(async () => {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

function makeRecord(overrides: Partial<KalkulasiRecord> = {}): KalkulasiRecord {
  return {
    id: "k1",
    userId: "u1",
    nama: "Vas bunga",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    input: {
      plates: [],
      batch: "1",
      komponen: [],
      labor: [],
      packing: undefined,
      channel: "offline",
      tier: "B",
    },
    snapshot: {
      biayaModal: 1000,
      hargaJualMinimum: 1500,
      rekomendasi: 2000,
      status: "AMAN",
      strategi: {},
    },
    ...overrides,
  } as KalkulasiRecord;
}

describe("kalkulasi-history store", () => {
  it(
    "put → get roundtrip",
    async () => {
      await putKalkulasi(makeRecord());
      const rec = await getKalkulasi("u1", "k1");
      expect(rec?.nama).toBe("Vas bunga");
    },
    10000
  );

  it(
    "list urut updatedAt desc",
    async () => {
      await putKalkulasi(makeRecord({ id: "k1", updatedAt: "2026-01-01T00:00:00.000Z" }));
      await putKalkulasi(makeRecord({ id: "k2", updatedAt: "2026-01-03T00:00:00.000Z" }));
      await putKalkulasi(makeRecord({ id: "k3", updatedAt: "2026-01-02T00:00:00.000Z" }));
      const list = await listKalkulasi("u1");
      expect(list.map((r) => r.id)).toEqual(["k2", "k3", "k1"]);
    },
    10000
  );

  it(
    "delete beneran hilang",
    async () => {
      await putKalkulasi(makeRecord());
      await deleteKalkulasi("u1", "k1");
      expect(await getKalkulasi("u1", "k1")).toBeNull();
      expect(await listKalkulasi("u1")).toEqual([]);
    },
    10000
  );

  it(
    "scoping userId — record user lain tak ke-return/ke-delete",
    async () => {
      await putKalkulasi(makeRecord({ id: "k1", userId: "u1" }));
      await putKalkulasi(makeRecord({ id: "k2", userId: "u2" }));
      expect(await getKalkulasi("u2", "k1")).toBeNull();
      expect(await listKalkulasi("u2")).toHaveLength(1);
      await deleteKalkulasi("u2", "k1");
      expect(await getKalkulasi("u1", "k1")).not.toBeNull();
    },
    10000
  );

  it(
    "upgrade dari DB versi 1 (settings sudah ada+berisi data) tak merusak data lama",
    async () => {
      const { openDB } = await import("idb");
      const v1 = await openDB(DB_NAME, 1, {
        upgrade(d) {
          d.createObjectStore("settings", { keyPath: "userId" });
        },
      });
      await v1.put("settings", { userId: "u1", settings: { mesinPerJam: 9999 } });
      v1.close();

      const records = await listKalkulasi("u1");
      expect(records).toEqual([]);

      const { loadSettings } = await import("@/lib/store/local-settings");
      const loaded = await loadSettings("u1");
      expect(loaded.mesinPerJam).toBe(9999);
    },
    10000
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/store/kalkulasi-history.test.ts`
Expected: FAIL — module `./kalkulasi-history` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/saas/lib/store/kalkulasi-history.ts`:

```ts
import { openLocalDb } from "./db";
import type { PlateRow } from "@/components/PlateInput";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";
import type { MarginTier, HasilKalkulasiV2 } from "@3pb/kalkulator-core";
import type { Strategi } from "@/lib/kalkulator/compute";

const STORE = "kalkulasi";

export interface KalkulasiInput {
  plates: PlateRow[];
  batch: string;
  komponen: KomponenRow[];
  labor: LaborRow[];
  packing?: { nama: string; harga: number };
  channel: string;
  tier: MarginTier;
}

export interface KalkulasiSnapshot {
  biayaModal: number;
  hargaJualMinimum: number;
  rekomendasi: number;
  status: HasilKalkulasiV2["status"];
  strategi: Strategi;
}

export interface KalkulasiRecord {
  id: string;
  userId: string;
  nama: string;
  createdAt: string;
  updatedAt: string;
  input: KalkulasiInput;
  snapshot: KalkulasiSnapshot;
}

/** Urut updatedAt desc (terbaru dulu). */
export async function listKalkulasi(userId: string): Promise<KalkulasiRecord[]> {
  const database = await openLocalDb();
  try {
    const all = (await database.getAllFromIndex(STORE, "by-userId", userId)) as KalkulasiRecord[];
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    database.close();
  }
}

export async function getKalkulasi(userId: string, id: string): Promise<KalkulasiRecord | null> {
  const database = await openLocalDb();
  try {
    const rec = (await database.get(STORE, id)) as KalkulasiRecord | undefined;
    if (!rec || rec.userId !== userId) return null;
    return rec;
  } finally {
    database.close();
  }
}

/** Create ATAU update (put by id). */
export async function putKalkulasi(record: KalkulasiRecord): Promise<void> {
  const database = await openLocalDb();
  try {
    await database.put(STORE, record);
  } finally {
    database.close();
  }
}

export async function deleteKalkulasi(userId: string, id: string): Promise<void> {
  const database = await openLocalDb();
  try {
    const rec = (await database.get(STORE, id)) as KalkulasiRecord | undefined;
    if (!rec || rec.userId !== userId) return;
    await database.delete(STORE, id);
  } finally {
    database.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/store/kalkulasi-history.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/store/kalkulasi-history.ts apps/saas/lib/store/kalkulasi-history.test.ts
git commit -m "feat(saas): kalkulasi-history IndexedDB CRUD scoped by userId"
```

---

### Task 3: `ResultPanel.tsx` — activate the Simpan/Update button

**Files:**
- Modify: `apps/saas/components/ResultPanel.tsx:13-19` (signature), `:100-107` (button block)
- Modify: `apps/saas/components/ResultPanel.test.tsx:28-36` (existing "Simpan disabled" assertion)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ResultPanel` gains optional props `onSave?: () => void`, `isEditing?: boolean` — consumed by Task 4 (`Calculator.tsx` passes these in both its desktop-sticky and mobile-sheet `<ResultPanel>` usages).

- [ ] **Step 1: Write the failing tests**

Modify `apps/saas/components/ResultPanel.test.tsx` — replace the last assertion in the "Salin & Reset" test (it currently asserts Simpan is disabled; that button no longer always renders) and append a new describe block. Full replacement for that one test plus the new block appended at the end of the file:

```tsx
  it("Salin & Reset memanggil handler; Simpan tak dirender tanpa onSave", () => {
    const onCopy = vi.fn(), onReset = vi.fn();
    render(<ResultPanel {...base} onCopy={onCopy} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /Salin harga jual/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(onCopy).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Simpan|Update/ })).toBeNull();
  });
```

(this replaces the old `it("Salin & Reset memanggil handler; Simpan disabled", ...)` block — same position, lines 28-36)

Append at the end of the file, before the final `});`:

```tsx

describe("ResultPanel: Simpan/Update (1b-4)", () => {
  const base = { view, channel: "offline", tier: "B" as const, onChannel: vi.fn(), onTier: vi.fn(), onCopy: vi.fn(), onReset: vi.fn() };
  it("onSave diberikan → tombol 'Simpan' muncul dan memanggilnya saat diklik", () => {
    const onSave = vi.fn();
    render(<ResultPanel {...base} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /^Simpan/ }));
    expect(onSave).toHaveBeenCalled();
  });
  it("isEditing=true → label tombol 'Update'", () => {
    render(<ResultPanel {...base} onSave={vi.fn()} isEditing />);
    expect(screen.getByRole("button", { name: /^Update/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ResultPanel.test.tsx`
Expected: FAIL — `onSave`/`isEditing` not accepted by `ResultPanel`, button still always renders disabled.

- [ ] **Step 3: Wire up the button**

Modify `apps/saas/components/ResultPanel.tsx` — signature (lines 13-19):

```tsx
export function ResultPanel({
  view, channel, tier, onChannel, onTier, onCopy, onReset, showRincian = true, onSave, isEditing = false,
}: {
  view: FullView; channel: string; tier: MarginTier;
  onChannel: (c: string) => void; onTier: (t: MarginTier) => void;
  onCopy: () => void; onReset: () => void; showRincian?: boolean;
  onSave?: () => void; isEditing?: boolean;
}) {
```

Replace the disabled button block (lines 104-106):

```tsx
          {onSave && (
            <button type="button" onClick={onSave} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[13px] font-medium">
              {isEditing ? "Update" : "Simpan"}
            </button>
          )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ResultPanel.test.tsx`
Expected: PASS (all cases, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/ResultPanel.tsx apps/saas/components/ResultPanel.test.tsx
git commit -m "feat(saas): activate Simpan/Update button in ResultPanel"
```

---

### Task 4: `Calculator.tsx` — nama field, load/save record, refresh tarif

**Files:**
- Modify: `apps/saas/components/Calculator.tsx` (whole file — see full replacement below)
- Modify: `apps/saas/components/Calculator.test.tsx` (add mocks + new describe block)

**Interfaces:**
- Consumes: `getKalkulasi, putKalkulasi, type KalkulasiRecord` from `@/lib/store/kalkulasi-history` (Task 2); `onSave`, `isEditing` props on `ResultPanel` (Task 3); `useRouter` from `next/navigation`.
- Produces: `Calculator` gains optional prop `kalkulasiId?: string` — consumed by Task 6's `/kalkulator/[id]/page.tsx`.

- [ ] **Step 1: Add mocks and failing tests to `Calculator.test.tsx`**

Modify `apps/saas/components/Calculator.test.tsx` — insert right after the existing `local-settings` mock block (after line 8, `import { loadSettings, saveSettings } from "@/lib/store/local-settings";`):

```tsx
const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("@/lib/store/kalkulasi-history", () => ({
  getKalkulasi: vi.fn(async () => null),
  putKalkulasi: vi.fn(async () => {}),
}));
import { getKalkulasi, putKalkulasi } from "@/lib/store/kalkulasi-history";
```

Append this new describe block at the end of the file, before the final `});` of the file (after the `Calculator katalog pekerjaan` describe block):

```tsx

describe("Calculator: simpan & riwayat (1b-4)", () => {
  it("tanpa kalkulasiId → tak menampilkan 'Memuat kalkulasi'", () => {
    render(<Calculator paidCore userId="u1" />);
    expect(screen.queryByText(/Memuat kalkulasi/)).toBeNull();
  });

  it("Free (paidCore=false) → field Nama tak muncul", () => {
    render(<Calculator paidCore={false} userId={null} />);
    expect(screen.queryByPlaceholderText(/Nama kalkulasi/)).toBeNull();
  });

  it("Pro → field Nama muncul", () => {
    render(<Calculator paidCore userId="u1" />);
    expect(screen.getByPlaceholderText(/Nama kalkulasi/)).toBeTruthy();
  });

  it("dengan kalkulasiId → getKalkulasi mengisi form dari record", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "Vas bunga",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "2", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByDisplayValue("Vas bunga")).toBeTruthy());
  });

  it("kalkulasiId tak ditemukan → pesan 'tidak ditemukan'", async () => {
    (getKalkulasi as any).mockResolvedValueOnce(null);
    render(<Calculator paidCore userId="u1" kalkulasiId="k-hilang" />);
    await waitFor(() => expect(screen.getByText(/tidak ditemukan/)).toBeTruthy());
  });

  it("simpan pertama kali → putKalkulasi dipanggil + router.push ke /kalkulator/[id]", async () => {
    mockPush.mockClear();
    (putKalkulasi as any).mockClear();
    render(<Calculator paidCore userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: /^Simpan/ }));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/kalkulator\//));
  });

  it("simpan kedua (sudah ada kalkulasiId) → putKalkulasi id sama, tanpa push lagi", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "X",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    mockPush.mockClear();
    (putKalkulasi as any).mockClear();
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Update/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /^Update/ }));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    expect((putKalkulasi as any).mock.calls[0][0].id).toBe("k1");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("klik '🔄 Refresh tarif' → loadSettings terpanggil lagi", async () => {
    (loadSettings as any).mockClear();
    render(<Calculator paidCore userId="u1" />);
    await waitFor(() => expect(loadSettings).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText(/Refresh tarif/));
    await waitFor(() => expect(loadSettings).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/Calculator.test.tsx`
Expected: FAIL — `Calculator` doesn't accept `kalkulasiId`, no "Nama kalkulasi" field, no Simpan button rendered, `next/navigation` mock unused.

- [ ] **Step 3: Rewrite `Calculator.tsx`**

Replace `apps/saas/components/Calculator.tsx` in full:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MarginTier } from "@3pb/kalkulator-core";
import { GlassInput } from "@3pb/ui";
import { fullView, type CalcPlate } from "@/lib/kalkulator/compute";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings } from "@/lib/store/local-settings";
import { getKalkulasi, putKalkulasi, type KalkulasiRecord } from "@/lib/store/kalkulasi-history";
import { getRincianPref } from "@/lib/store/display-prefs";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";
import { CalcSection } from "./CalcSection";
import { PlateInput, type PlateRow } from "./PlateInput";
import { KomponenInput } from "./KomponenInput";
import { LaborInput } from "./LaborInput";
import { PackingInput } from "./PackingInput";
import { ResultPanel } from "./ResultPanel";
import { MobileSummaryBar } from "./MobileSummaryBar";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";

const INITIAL_PLATES: PlateRow[] = [{ id: "plate-1", nama: "", durasiJam: "3", materials: [{ id: "m1", tipe: "FDM", gramasi: "50" }] }];

export function Calculator({ paidCore = false, userId = null, kalkulasiId }: { paidCore?: boolean; userId?: string | null; kalkulasiId?: string }) {
  const router = useRouter();
  const [plates, setPlates] = useState<PlateRow[]>(INITIAL_PLATES);
  const [batch, setBatch] = useState("1");
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [komponen, setKomponen] = useState<KomponenRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [packing, setPacking] = useState<{ nama: string; harga: number } | undefined>(undefined);
  const [channel, setChannel] = useState("offline");
  const [tier, setTier] = useState<MarginTier>("B");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showRincian, setShowRincian] = useState(true);
  const [nama, setNama] = useState("");
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [createdAt, setCreatedAt] = useState<string | undefined>(undefined);
  const [loadingRecord, setLoadingRecord] = useState(!!kalkulasiId);
  const [notFound, setNotFound] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (paidCore && userId) loadSettings(userId).then(setSettings);
  }, [paidCore, userId]);

  useEffect(() => { setShowRincian(getRincianPref()); }, []);

  useEffect(() => {
    if (!kalkulasiId || !userId) return;
    let cancelled = false;
    getKalkulasi(userId, kalkulasiId).then((record) => {
      if (cancelled) return;
      if (!record) { setNotFound(true); setLoadingRecord(false); return; }
      setPlates(record.input.plates);
      setBatch(record.input.batch);
      setKomponen(record.input.komponen);
      setLabor(record.input.labor);
      setPacking(record.input.packing);
      setChannel(record.input.channel);
      setTier(record.input.tier);
      setNama(record.nama);
      setSavedId(record.id);
      setCreatedAt(record.createdAt);
      setLoadingRecord(false);
    });
    return () => { cancelled = true; };
  }, [kalkulasiId, userId]);

  const refreshTarif = () => {
    if (paidCore && userId) loadSettings(userId).then(setSettings);
  };

  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, durasiJam: Number(p.durasiJam),
    materials: p.materials.map((m) => ({ filamentId: m.filamentId, tipe: m.tipe, gramasi: Number(m.gramasi) })),
  });
  const valid = plates.length > 0 && plates.every(
    (p) => Number(p.durasiJam) > 0 && p.materials.length > 0 && p.materials.every((m) => Number(m.gramasi) > 0),
  );
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid
    ? fullView({ plates: plates.map(toCalcPlate), batch: paidCore ? Number(batch) : 1, ...addon }, settings)
    : null;

  const onReset = () => {
    setPlates(INITIAL_PLATES); setBatch("1"); setKomponen([]); setLabor([]); setPacking(undefined);
    setChannel("offline"); setTier("B");
  };
  const onCopy = () => {
    if (view) navigator.clipboard?.writeText(String(view.strategi[channel]?.[tier]?.harga ?? "")).catch(() => {});
  };
  const onAddJob = (job: { nama: string; ratePerJam?: number; flat?: number }) => {
    if (settings.laborJobs.some((j) => j.nama.trim().toLowerCase() === job.nama.trim().toLowerCase())) return;
    const next = { ...settings, laborJobs: [...settings.laborJobs, { id: newId(), ...job }] };
    setSettings(next);
    if (paidCore && userId) saveSettings(userId, next).catch(() => {});
  };
  const handleSave = () => {
    if (!userId || !view) { if (!view) setSaveMsg("Isi berat & durasi dulu"); return; }
    const id = savedId ?? newId();
    const finalNama = nama.trim() || "Kalkulasi " + new Date().toLocaleDateString("id-ID");
    const finalCreatedAt = createdAt ?? new Date().toISOString();
    const record: KalkulasiRecord = {
      id,
      userId,
      nama: finalNama,
      createdAt: finalCreatedAt,
      updatedAt: new Date().toISOString(),
      input: { plates, batch, komponen, labor, packing, channel, tier },
      snapshot: {
        biayaModal: view.biayaModal,
        hargaJualMinimum: view.hargaJualMinimum,
        rekomendasi: view.rekomendasi,
        status: view.status,
        strategi: view.strategi,
      },
    };
    const isFirstSave = savedId === undefined;
    putKalkulasi(record).then(() => {
      setSavedId(id);
      setCreatedAt(finalCreatedAt);
      setNama(finalNama);
      setSaveMsg(null);
      if (isFirstSave) router.push(`/kalkulator/${id}`);
    });
  };

  const r = view?.rincian;
  const hasil = Math.max(1, Number(batch) || 1);

  if (loadingRecord) {
    return <div className="text-[12px] g-t4 p-4">Memuat kalkulasi…</div>;
  }
  if (notFound) {
    return (
      <div className="text-[12px] g-t4 p-4">
        Kalkulasi tidak ditemukan. <Link href="/" className="underline">Kembali ke Riwayat</Link>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(350px,410px)] gap-5 items-start pb-24 lg:pb-0">
      {/* Kolom kiri: form section */}
      <div className="flex flex-col gap-4 min-w-0">
        {paidCore && (
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/" className="text-[12px] g-t3 underline shrink-0">← Riwayat</Link>
            <GlassInput
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama kalkulasi (opsional)"
              className="flex-1 min-w-[160px]"
            />
            <button type="button" onClick={refreshTarif} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[12px] shrink-0">
              🔄 Refresh tarif
            </button>
          </div>
        )}
        {saveMsg && <div className="text-[12px] g-t4">{saveMsg}</div>}

        <CalcSection n={1} title="Produksi (Cetak 3D)" subtitle="Biaya material dan waktu cetak" icon="🖨️"
          subtotalLabel="Subtotal per produk" subtotal={r?.produksi}>
          <PlateInput locked={!paidCore} plates={plates} batch={batch} filaments={settings.filaments} onPlatesChange={setPlates} onBatchChange={setBatch} />
          {paidCore && (
            <div className="mt-3 rounded-[5px] p-3 flex gap-2 text-[11px] g-t3 leading-relaxed"
              style={{ background: "color-mix(in srgb, var(--g-accent) 6%, transparent)" }}>
              <span className="shrink-0">ℹ️</span>
              <span>Angka di atas = jumlah produk yang dihasilkan dari 1 proses cetak. Biaya produksi dibagi angka ini.</span>
            </div>
          )}
          {view && (
            <div className="mt-3 grid grid-cols-3 rounded-[5px] border" style={{ borderColor: "var(--g-row-border)" }}>
              <div className="p-3">
                <div className="text-[10px] g-t4">Biaya per proses cetak</div>
                <div className="text-[15px] font-bold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(r!.produksi * hasil)}</div>
              </div>
              <div className="p-3" style={{ borderLeft: "1px solid var(--g-row-border)" }}>
                <div className="text-[10px] g-t4">Hasil per proses</div>
                <div className="text-[15px] font-bold g-t1">{hasil} pcs</div>
              </div>
              <div className="p-3" style={{ borderLeft: "1px solid var(--g-row-border)" }}>
                <div className="text-[10px] g-t4">Biaya per produk</div>
                <div className="text-[15px] font-bold" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{rupiah(r!.produksi)}</div>
              </div>
            </div>
          )}
        </CalcSection>

        <CalcSection n={2} title="Komponen tambahan" subtitle="Komponen yang dipasang pada produk" icon="🧩"
          subtotal={paidCore ? (r?.komponen ?? 0) : undefined}
          summary={komponen.length ? `${komponen.length} item · ${rupiah(r?.komponen ?? 0)}` : "Belum ada"}>
          <KomponenInput locked={!paidCore} presets={settings.komponenPresets} komponen={komponen} onChange={setKomponen} />
        </CalcSection>

        <CalcSection n={3} title="Finishing & tenaga kerja" subtitle="Perakitan, pengamplasan, pengecatan, dll." icon="🛠️"
          subtotal={paidCore ? (r?.labor ?? 0) : undefined}
          summary={labor.length ? `${labor.length} pekerjaan · ${rupiah(r?.labor ?? 0)}` : "Belum ada"}>
          <LaborInput locked={!paidCore} presets={settings.laborPresets} labor={labor} onChange={setLabor}
            jobs={settings.laborJobs} onAddJob={onAddJob} />
        </CalcSection>

        <CalcSection n={4} title="Packing" subtitle="Biaya kemasan & pelindung produk" icon="📦"
          subtotal={paidCore ? (r?.packing ?? 0) : undefined}
          summary={packing ? `${packing.nama} · ${rupiah(packing.harga)}` : "Tanpa packing"}>
          <PackingInput locked={!paidCore} presets={settings.packingPresets} packing={packing} onChange={setPacking} />
        </CalcSection>
      </div>

      {/* Kolom kanan: hasil (sticky desktop) */}
      <div className="hidden lg:block lg:sticky lg:top-6 min-w-0">
        {view ? (
          <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian}
            onSave={paidCore ? handleSave : undefined} isEditing={savedId !== undefined} />
        ) : (
          <div className="text-[12px] g-t4 p-4">Isi berat &amp; durasi (angka &gt; 0) untuk melihat hasil.</div>
        )}
      </div>

      {view && (
        <>
          <MobileSummaryBar modal={view.rincian.biayaModal} harga={view.strategi[channel]?.[tier]?.harga ?? 0} onOpen={() => setSheetOpen(true)} />
          {sheetOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
              <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={() => setSheetOpen(false)} />
              <div className="relative max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 modal-surface">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold g-t1">Hasil perhitungan</span>
                  <button type="button" aria-label="Tutup rincian" className="g-t3 text-lg leading-none" onClick={() => setSheetOpen(false)}>✕</button>
                </div>
                <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian}
                  onSave={paidCore ? handleSave : undefined} isEditing={savedId !== undefined} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/Calculator.test.tsx`
Expected: PASS — all pre-existing cases plus the new "1b-4" describe block.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/Calculator.tsx apps/saas/components/Calculator.test.tsx
git commit -m "feat(saas): Calculator saves/loads kalkulasi records, refresh-tarif button"
```

---

### Task 5: `RiwayatList.tsx` — history page component

**Files:**
- Create: `apps/saas/components/RiwayatList.tsx`
- Create: `apps/saas/components/RiwayatList.test.tsx`

**Interfaces:**
- Consumes: `listKalkulasi, deleteKalkulasi, type KalkulasiRecord` from `@/lib/store/kalkulasi-history` (Task 2); `rupiah` from `@/lib/kalkulator/format`; `GlassCard, GlassButton` from `@3pb/ui`.
- Produces: `RiwayatList({ userId: string })` — consumed by Task 6's `app/page.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/saas/components/RiwayatList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RiwayatList } from "./RiwayatList";

vi.mock("@/lib/store/kalkulasi-history", () => ({
  listKalkulasi: vi.fn(async () => []),
  deleteKalkulasi: vi.fn(async () => {}),
}));
import { listKalkulasi, deleteKalkulasi } from "@/lib/store/kalkulasi-history";

const REC = {
  id: "k1", userId: "u1", nama: "Vas bunga",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
  input: { plates: [], batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B" },
  snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 25000, status: "AMAN", strategi: {} },
};

beforeEach(() => {
  (listKalkulasi as any).mockReset().mockResolvedValue([]);
  (deleteKalkulasi as any).mockReset().mockResolvedValue(undefined);
});

describe("RiwayatList", () => {
  it("kosong → pesan + tombol Hitung", async () => {
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText(/Belum ada riwayat/)).toBeTruthy());
    expect(screen.getByText("Hitung")).toBeTruthy();
  });

  it("ada records → tampil nama & harga", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    expect(screen.getByText(/25\.000/)).toBeTruthy();
  });

  it("klik baris → link ke /kalkulator/[id]", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    const link = screen.getByText("Vas bunga").closest("a");
    expect(link).toHaveAttribute("href", "/kalkulator/k1");
  });

  it("klik Hapus → confirm dulu, batal kalau confirm() false", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => false);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Hapus"));
    expect(deleteKalkulasi).not.toHaveBeenCalled();
  });

  it("klik Hapus → confirm true → deleteKalkulasi + refresh list", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => true);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Hapus"));
    await waitFor(() => expect(deleteKalkulasi).toHaveBeenCalledWith("u1", "k1"));
    expect(listKalkulasi).toHaveBeenCalledTimes(2);
  });

  it("klik '🔄 Refresh' → listKalkulasi terpanggil lagi", async () => {
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(listKalkulasi).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText(/Refresh/));
    await waitFor(() => expect(listKalkulasi).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/RiwayatList.test.tsx`
Expected: FAIL — module `./RiwayatList` doesn't exist.

- [ ] **Step 3: Write the implementation**

Create `apps/saas/components/RiwayatList.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard, GlassButton } from "@3pb/ui";
import { listKalkulasi, deleteKalkulasi, type KalkulasiRecord } from "@/lib/store/kalkulasi-history";
import { rupiah } from "@/lib/kalkulator/format";

export function RiwayatList({ userId }: { userId: string }) {
  const [records, setRecords] = useState<KalkulasiRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listKalkulasi(userId).then((r) => { setRecords(r); setLoading(false); });
  };

  useEffect(() => { load(); }, [userId]);

  const onDelete = (id: string) => {
    if (!window.confirm("Hapus kalkulasi ini? Tindakan ini tak bisa dibatalkan.")) return;
    deleteKalkulasi(userId, id).then(load);
  };

  if (loading) {
    return <div className="text-[12px] g-t4 p-4">Memuat riwayat…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link href="/kalkulator"><GlassButton>Hitung</GlassButton></Link>
        <button type="button" onClick={load} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[12px]">🔄 Refresh</button>
      </div>

      {records.length === 0 ? (
        <GlassCard className="p-6 text-center">
          <p className="text-[13px] g-t3">Belum ada riwayat, mulai hitung pertama kamu.</p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((rec) => (
            <GlassCard key={rec.id} className="p-3 flex items-center justify-between gap-3">
              <Link href={`/kalkulator/${rec.id}`} className="flex-1 min-w-0 no-underline">
                <div className="text-[13px] font-medium g-t1 truncate">{rec.nama}</div>
                <div className="text-[11px] g-t4">{new Date(rec.updatedAt).toLocaleDateString("id-ID")} · {rupiah(rec.snapshot.rekomendasi)}</div>
              </Link>
              <button type="button" aria-label="Hapus" onClick={() => onDelete(rec.id)} className="g-btn-ghost h-8 px-2 rounded-[5px] text-[13px] shrink-0">🗑️</button>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/RiwayatList.test.tsx`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/RiwayatList.tsx apps/saas/components/RiwayatList.test.tsx
git commit -m "feat(saas): RiwayatList — Riwayat history page component"
```

---

### Task 6: Routes — `/kalkulator`, `/kalkulator/[id]`, and `/` branch

**Files:**
- Create: `apps/saas/app/kalkulator/page.tsx`
- Create: `apps/saas/app/kalkulator/[id]/page.tsx`
- Modify: `apps/saas/app/page.tsx`

**Interfaces:**
- Consumes: `Calculator` with `kalkulasiId?` prop (Task 4), `RiwayatList` (Task 5), existing `auth()`, `getEntitlement`/`capabilities`, `isOwner`, `PageShell`.
- Produces: nothing consumed by later tasks — this is the final wiring.

No dedicated test file for these three files — they are thin Server Component wrappers (same pattern as the existing, untested `apps/saas/app/settings/page.tsx`); their logic (redirect gating, prop wiring) is exercised indirectly through `Calculator.test.tsx` and `RiwayatList.test.tsx`, and confirmed by `tsc --noEmit` + `next build` in Task 7.

- [ ] **Step 1: Create the new-calculator route**

Create `apps/saas/app/kalkulator/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { Calculator } from "@/components/Calculator";
import { PageShell } from "@/components/PageShell";

export default async function KalkulatorBaruPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  if (!capabilities(ent).paidCore) redirect("/");
  return (
    <PageShell title="Kalkulator harga jual" current="kalkulator" owner={isOwner(session.user.email)} userLabel={session.user.email ?? undefined}>
      <Calculator paidCore userId={session.user.id} />
    </PageShell>
  );
}
```

- [ ] **Step 2: Create the edit-existing-record route**

Create `apps/saas/app/kalkulator/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { Calculator } from "@/components/Calculator";
import { PageShell } from "@/components/PageShell";

export default async function KalkulatorEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  if (!capabilities(ent).paidCore) redirect("/");
  const { id } = await params;
  return (
    <PageShell title="Kalkulator harga jual" current="kalkulator" owner={isOwner(session.user.email)} userLabel={session.user.email ?? undefined}>
      <Calculator paidCore userId={session.user.id} kalkulasiId={id} />
    </PageShell>
  );
}
```

- [ ] **Step 3: Branch `/` between Riwayat (Pro) and Calculator (Free)**

Replace `apps/saas/app/page.tsx` in full:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { Calculator } from "@/components/Calculator";
import { RiwayatList } from "@/components/RiwayatList";
import { PageShell } from "@/components/PageShell";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const paidCore = capabilities(ent).paidCore;
  return (
    <PageShell title="Kalkulator harga jual" description="Hitung biaya modal & harga jual produk 3D print-mu." current="kalkulator" owner={isOwner(session.user.email)} userLabel={session.user.email ?? undefined}>
      {paidCore ? <RiwayatList userId={session.user.id} /> : <Calculator paidCore={false} userId={session.user.id} />}
    </PageShell>
  );
}
```

- [ ] **Step 4: Typecheck the new routes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && npx prisma generate && npx tsc --noEmit`
Expected: no errors (the `prisma generate` re-run guards against the known stale-client `UserSelect` error seen earlier this session on unrelated files).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/app/kalkulator/page.tsx apps/saas/app/kalkulator/\[id\]/page.tsx apps/saas/app/page.tsx
git commit -m "feat(saas): / becomes Riwayat for Pro, add /kalkulator and /kalkulator/[id] routes"
```

---

### Task 7: Verifikasi akhir

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && npx vitest run`
Expected: all tests pass, including every file touched/added in Tasks 1-5.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: no type errors, build succeeds (if `next build` fails on a stale-Prisma-client error unrelated to this feature, re-run `npx prisma generate` first — a recurring environment issue seen repeatedly this session, not a code bug).

- [ ] **Step 3: Whole-monorepo test run (confirm no cross-package regression)**

From repo root: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm turbo test`
Expected: all packages green (dashboard, kalkulator-core, saas, landing, ui).

- [ ] **Step 4: Confirm scope — nothing outside `apps/saas` touched**

Run: `git status` and `git diff --stat master...HEAD`
Expected: only files listed in Tasks 1-6 above appear in the diff (`apps/saas/lib/store/db.ts`, `apps/saas/lib/store/db.test.ts`, `apps/saas/lib/store/local-settings.ts`, `apps/saas/lib/store/kalkulasi-history.ts`, `apps/saas/lib/store/kalkulasi-history.test.ts`, `apps/saas/components/ResultPanel.tsx`, `apps/saas/components/ResultPanel.test.tsx`, `apps/saas/components/Calculator.tsx`, `apps/saas/components/Calculator.test.tsx`, `apps/saas/components/RiwayatList.tsx`, `apps/saas/components/RiwayatList.test.tsx`, `apps/saas/app/kalkulator/page.tsx`, `apps/saas/app/kalkulator/[id]/page.tsx`, `apps/saas/app/page.tsx`).

No commit in this task — it's verification-only. If everything is green, the branch is ready for the final whole-branch review and `finishing-a-development-branch`.

---

## Note on manual/visual verification

This feature is data/routing logic (IndexedDB + auth-gated redirects), not primarily visual — unlike the earlier `PlateInput.tsx` redesign this session, a meaningful live click-through requires a real NextAuth magic-link session, which isn't scriptable headlessly. Verification here relies on the test suite (Tasks 1-5) plus typecheck/build (Task 7). If the user wants a live smoke-test of the Riwayat flow, that's best done after an explicit, separately-requested deploy — not part of this plan.
