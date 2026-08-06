# CYD PageTabs Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 bugs in the CYD layout editor's page-tabs UI (`/printer`): tabs unclickable, inconsistent default page naming, and add missing page-rename capability.

**Architecture:** Two trivial one-line fixes (`PointerSensor` activation constraint, default page ID) plus a self-contained rename feature added entirely within `PageTabs.tsx`'s existing local-state pattern (mirroring `DeviceList.tsx`'s inline-rename UI), with one new callback prop (`onRename`) threaded to `LayoutEditor.tsx`.

**Tech Stack:** TypeScript, Next.js 16 (App Router), `@dnd-kit/core`/`@dnd-kit/sortable`, Vitest + Testing Library, pnpm workspace.

## Global Constraints

- All 3 bugs are pre-existing (dated 2026-07-28 port commit `9e67c265`), NOT a regression from any recent work — no other code outside the files listed below should need changes.
- **WAJIB kerja di worktree sesi ini** (`~/Documents/shopee-analysis/.claude/worktrees/inspiring-turing-f985b5`, branch `claude/firmware-cyd-738640`) -- JANGAN commit ke folder utama/master. Sebelum commit apa pun, jalankan `git branch --show-current` dan pastikan hasilnya `claude/firmware-cyd-738640`.
- Monorepo pnpm strict rules: `git add <path spesifik>` saja, JANGAN `git add -A`/`git add .`.
- Rename validation on commit (not while typing): empty (after trim) → silently revert to old id, no error shown. Duplicate id (case-sensitive exact match against another page in the same config) → if committed via Enter, show inline error `"Nama halaman sudah dipakai"` and STAY in edit mode so the user can retry; if committed via blur (focus lost some other way), silently revert with no error (forcing focus back on blur is unreliable UX, not attempted).
- Page-length validation (`LAYOUT_LIMITS.maxPageIdLength`) is already enforced elsewhere (`findLayoutProblem()` at Save time) — do NOT duplicate that check in the rename UI itself.
- Spec acuan: `docs/superpowers/specs/2026-08-06-cyd-pagetabs-fixes-design.md` (repo ini).

---

### Task 1: Fix tabs not being clickable

**Files:**
- Modify: `apps/saas/components/printer/layout-editor/PageTabs.tsx:85`
- Test: `apps/saas/components/printer/layout-editor/PageTabs.test.tsx` (NEW FILE — created here, extended by Task 3)

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: nothing consumed by other tasks (Tasks 2 and 3 don't depend on this fix's internals, though Task 3's rename-button click depends on the SAME `activationConstraint` fix being present to work reliably — since this task lands first, Task 3 inherits it for free)

- [ ] **Step 1: Write the failing test**

Create `apps/saas/components/printer/layout-editor/PageTabs.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PageTabs } from "./PageTabs";

const twoPages = [
  { id: "hal-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] },
  { id: "hal-2", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] },
];

describe("PageTabs", () => {
  it("klik tab memanggil onSelect dengan index yang benar", () => {
    const onSelect = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={onSelect}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
      />
    );
    fireEvent.click(screen.getByText("hal-2"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
```

(No `onRename` prop yet — `PageTabs` doesn't have it until Task 3. Task 3 will add `onRename` to `PageTabs`'s props AND update this render call, plus every other render call added in this file, to pass it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/saas && npx vitest run components/printer/layout-editor/PageTabs.test.tsx`
Expected: FAIL — `onSelect` is never called because `PointerSensor` without `activationConstraint` swallows the click (this is the actual bug under test).

- [ ] **Step 3: Fix the sensor**

In `apps/saas/components/printer/layout-editor/PageTabs.tsx`, find:

```tsx
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
```

Change to:

```tsx
  // distance:4 supaya klik-biasa tetap bisa dibedakan dari drag -- tanpa ini PointerSensor mulai
  // drag pada gerakan sekecil apa pun dan menelan onClick (pola sama LayoutEditor.tsx:95, lupa
  // diterapkan juga di sensor PageTabs.tsx sendiri -- 2 DndContext terpisah, 2 sensor terpisah).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/saas && npx vitest run components/printer/layout-editor/PageTabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # WAJIB: pastikan hasilnya claude/firmware-cyd-738640, bukan master
git add apps/saas/components/printer/layout-editor/PageTabs.tsx apps/saas/components/printer/layout-editor/PageTabs.test.tsx
git commit -m "fix(saas): tab halaman CYD editor tak bisa diklik -- PointerSensor kurang activationConstraint"
```

---

### Task 2: Fix default page naming inconsistency

**Files:**
- Modify: `apps/saas/components/printer/LayoutEditor.tsx:26`
- Test: `apps/saas/components/printer/LayoutEditor.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Write the failing test**

In `apps/saas/components/printer/LayoutEditor.test.tsx`, add this test inside the existing `describe("LayoutEditor", ...)` block (place it near the top, after the first "muat layout dari GET" test):

```tsx
  it("halaman default (tak ada layout tersimpan) pakai id 'hal-1', bukan 'page-1'", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    render(<LayoutEditor devices={[]} />);
    await waitFor(() => expect(screen.getByText("hal-1")).toBeTruthy());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/saas && npx vitest run components/printer/LayoutEditor.test.tsx`
Expected: FAIL — the default page renders as `"page-1"`, so `screen.getByText("hal-1")` doesn't find anything.

- [ ] **Step 3: Fix the default**

In `apps/saas/components/printer/LayoutEditor.tsx`, find:

```tsx
function defaultConfig(): LayoutConfigOut {
  return {
    schemaVersion: 1,
    pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }],
  };
}
```

Change `id: "page-1"` to `id: "hal-1"`:

```tsx
function defaultConfig(): LayoutConfigOut {
  return {
    schemaVersion: 1,
    pages: [{ id: "hal-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }],
  };
}
```

(`nextPageNumberRef` starts at `2` independently — `apps/saas/components/printer/LayoutEditor.tsx:98` — so newly-added pages still become `hal-2`, `hal-3`, etc. with no further change needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/saas && npx vitest run components/printer/LayoutEditor.test.tsx`
Expected: PASS — all tests in this file green, including the new one and the pre-existing ones (which supply their own page ids via mocked fetch responses, so they're unaffected by this default-value change).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/saas/components/printer/LayoutEditor.tsx apps/saas/components/printer/LayoutEditor.test.tsx
git commit -m "fix(saas): default halaman pertama pakai 'hal-1' (Indonesia), samain dgn halaman baru"
```

---

### Task 3: Add page rename capability

**Files:**
- Modify: `apps/saas/components/printer/layout-editor/PageTabs.tsx`
- Modify: `apps/saas/components/printer/LayoutEditor.tsx`
- Test: `apps/saas/components/printer/layout-editor/PageTabs.test.tsx` (created by Task 1, extended here)

**Interfaces:**
- Consumes: `PageTabs` component signature from Task 1 (already has the `activationConstraint` fix, which this task's new pencil-icon button relies on to receive clicks correctly)
- Produces: `PageTabs`'s new `onRename: (index: number, newId: string) => void` prop — this is the ONLY new public interface, consumed by `LayoutEditor.tsx`'s new `renamePage` function in this same task (no other task depends on it)

- [ ] **Step 1: Write the failing tests**

In `apps/saas/components/printer/layout-editor/PageTabs.test.tsx`, first update the EXISTING Task 1 test's render call (`onRename` becomes a required prop in Step 3 of this task, so every render call in this file needs it) — add `onRename={() => {}}` to the props passed in the "klik tab memanggil onSelect..." test from Task 1. Then add these NEW tests inside the same `describe("PageTabs", ...)` block (after the Task 1 test):

```tsx
  it("klik ikon pensil masuk mode edit, Enter commit rename via onRename", () => {
    const onRename = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByTitle("Ganti nama halaman hal-1"));
    const input = screen.getByDisplayValue("hal-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "rak-kiri" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith(0, "rak-kiri");
  });

  it("commit id kosong -> tidak memanggil onRename, kembali ke tampilan normal", () => {
    const onRename = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByTitle("Ganti nama halaman hal-1"));
    const input = screen.getByDisplayValue("hal-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("hal-1")).toBeTruthy(); // balik ke tampilan normal, id lama tetap
  });

  it("commit id duplikat via Enter -> tidak memanggil onRename, pesan error muncul, tetap mode edit", () => {
    const onRename = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByTitle("Ganti nama halaman hal-1"));
    const input = screen.getByDisplayValue("hal-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hal-2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Nama halaman sudah dipakai")).toBeTruthy();
    expect(screen.getByDisplayValue("hal-2")).toBeTruthy(); // masih di mode edit, input tetap ada
  });

  it("Escape membatalkan edit tanpa memanggil onRename", () => {
    const onRename = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByTitle("Ganti nama halaman hal-1"));
    const input = screen.getByDisplayValue("hal-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "berubah-tapi-batal" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("hal-1")).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/saas && npx vitest run components/printer/layout-editor/PageTabs.test.tsx`
Expected: FAIL — `onRename` prop doesn't exist, no `title="Ganti nama halaman hal-1"` element exists, no rename input exists.

- [ ] **Step 3: Add rename UI + logic to `PageTabs.tsx`**

Replace the ENTIRE contents of `apps/saas/components/printer/layout-editor/PageTabs.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { LAYOUT_LIMITS, type LayoutPageOut } from "@3pb/cyd-layout-schema";

function SortableTab({
  page,
  isActive,
  onSelect,
  onRemove,
  canRemove,
  isEditing,
  draftId,
  renameError,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
}: {
  page: LayoutPageOut;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  canRemove: boolean;
  isEditing: boolean;
  draftId: string;
  renameError: string | null;
  onStartRename: () => void;
  onDraftChange: (value: string) => void;
  onCommitRename: (viaBlur: boolean) => void;
  onCancelRename: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  // `touch-none` WAJIB di elemen ber-ref useSortable/useDraggable: tanpa `touch-action: none`,
  // browser mobile meng-klaim gesture sentuh buat scroll dan drag tak pernah jalan (app ini PWA
  // yang memang dipakai di HP). Jangan ditambahkan ke elemen non-draggable — malah mematikan
  // scroll normal di sekitarnya.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.85 : 1, zIndex: isDragging ? 30 : undefined }}
      onClick={isEditing ? undefined : onSelect}
      className={`relative flex touch-none cursor-pointer select-none items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        isActive ? "text-white" : "text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"
      }`}
    >
      {isActive && !isEditing && (
        <motion.div
          layoutId="cyd-page-tab-blob"
          className="absolute inset-0 rounded-full"
          style={{
            background: "linear-gradient(135deg, #5055e8, #818cf8)",
            boxShadow: "0 4px 14px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      {isEditing ? (
        <input
          aria-label={`Nama halaman ${page.id}`}
          autoFocus
          value={draftId}
          onChange={(e) => onDraftChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => onCommitRename(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename(false);
            if (e.key === "Escape") onCancelRename();
          }}
          className="relative z-10 w-24 rounded-md bg-white/90 px-1.5 py-0.5 text-[13px] text-gray-900 outline-none dark:bg-slate-800 dark:text-white"
        />
      ) : (
        <span className="relative z-10 font-medium">{page.id}</span>
      )}
      {!isEditing && (
        <motion.span
          whileHover={{ scale: 1.25 }}
          whileTap={{ scale: 0.85 }}
          onClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          title={`Ganti nama halaman ${page.id}`}
          className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none opacity-60 transition-colors hover:opacity-100 ${
            isActive ? "hover:bg-white/25" : "hover:bg-indigo-500/15 hover:text-indigo-500"
          }`}
        >
          ✎
        </motion.span>
      )}
      {canRemove && !isEditing && (
        <motion.span
          whileHover={{ scale: 1.25 }}
          whileTap={{ scale: 0.85 }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Hapus halaman"
          className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none opacity-60 transition-colors hover:opacity-100 ${
            isActive ? "hover:bg-white/25" : "hover:bg-red-500/15 hover:text-red-500"
          }`}
        >
          ✕
        </motion.span>
      )}
      {isEditing && renameError && (
        <span className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-md bg-red-500/90 px-2 py-0.5 text-[10px] text-white">
          {renameError}
        </span>
      )}
    </div>
  );
}

export function PageTabs({
  pages,
  activeIndex,
  onSelect,
  onAdd,
  onRemove,
  onReorder,
  onRename,
}: {
  pages: LayoutPageOut[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onReorder: (newPages: LayoutPageOut[]) => void;
  onRename: (index: number, newId: string) => void;
}) {
  // distance:4 supaya klik-biasa tetap bisa dibedakan dari drag -- tanpa ini PointerSensor mulai
  // drag pada gerakan sekecil apa pun dan menelan onClick (pola sama LayoutEditor.tsx:95, lupa
  // diterapkan juga di sensor PageTabs.tsx sendiri -- 2 DndContext terpisah, 2 sensor terpisah).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // Batas firmware (LAYOUT_LIMITS.maxPages) — tombol "+" mati kalau sudah mentok, biar user tak
  // menabrak 400 dari server.
  const canAdd = pages.length < LAYOUT_LIMITS.maxPages;

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftId, setDraftId] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  function startRename(index: number) {
    setEditingIndex(index);
    setDraftId(pages[index].id);
    setRenameError(null);
  }

  function cancelRename() {
    setEditingIndex(null);
    setRenameError(null);
  }

  // Batas panjang id (LAYOUT_LIMITS.maxPageIdLength) SUDAH tercek di findLayoutProblem() saat
  // Simpan -- tak diduplikasi di sini. Hanya 2 pemeriksaan breaking-langsung: kosong & duplikat
  // (keunikan page.id dulu dijamin struktural oleh nextPageNumberRef di LayoutEditor.tsx, tapi
  // begitu rename bebas diizinkan jaminan itu hilang -- id dobel akan merusak SortableContext
  // items={pages.map(p=>p.id)} dan React key={p.id}).
  function commitRename(index: number, viaBlur: boolean) {
    const trimmed = draftId.trim();
    const currentId = pages[index].id;
    if (trimmed === currentId || !trimmed) {
      setEditingIndex(null);
      setRenameError(null);
      return;
    }
    const isDuplicate = pages.some((p, i) => i !== index && p.id === trimmed);
    if (isDuplicate) {
      if (viaBlur) {
        // Blur (klik di luar) -- jangan maksa fokus balik, revert diam-diam.
        setEditingIndex(null);
        setRenameError(null);
        return;
      }
      // Enter -- tetap di mode edit, biar user coba nama lain.
      setRenameError("Nama halaman sudah dipakai");
      return;
    }
    onRename(index, trimmed);
    setEditingIndex(null);
    setRenameError(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    onReorder(arrayMove(pages, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="g-card inline-flex flex-wrap items-center gap-1 rounded-full p-1 backdrop-blur-[12px]">
          <SortableContext items={pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
            {pages.map((p, i) => (
              <SortableTab
                key={p.id}
                page={p}
                isActive={i === activeIndex}
                onSelect={() => onSelect(i)}
                onRemove={() => onRemove(i)}
                canRemove={pages.length > 1}
                isEditing={editingIndex === i}
                draftId={draftId}
                renameError={editingIndex === i ? renameError : null}
                onStartRename={() => startRename(i)}
                onDraftChange={setDraftId}
                onCommitRename={(viaBlur) => commitRename(i, viaBlur)}
                onCancelRename={cancelRename}
              />
            ))}
          </SortableContext>
        </div>
        <motion.button
          type="button"
          whileHover={canAdd ? { scale: 1.04 } : undefined}
          whileTap={canAdd ? { scale: 0.95 } : undefined}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          onClick={onAdd}
          disabled={!canAdd}
          title={canAdd ? "Tambah halaman" : `Maksimal ${LAYOUT_LIMITS.maxPages} halaman`}
          className="rounded-full border border-dashed border-gray-400/60 px-3.5 py-1.5 text-sm text-gray-500 transition-colors hover:border-indigo-400/70 hover:bg-indigo-500/5 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-400/60 disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:border-slate-600 dark:text-slate-400 dark:hover:border-indigo-400/60 dark:hover:text-indigo-300"
        >
          + Halaman
        </motion.button>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 4: Wire `onRename` in `LayoutEditor.tsx`**

In `apps/saas/components/printer/LayoutEditor.tsx`, find the `removePage` function (defined near the other page-management functions like `addPage`) and add a new `renamePage` function right after it:

```tsx
  function renamePage(index: number, newId: string) {
    setConfig((cfg) => ({ ...cfg, pages: cfg.pages.map((p, i) => (i === index ? { ...p, id: newId } : p)) }));
  }
```

Then find where `<PageTabs .../>` is rendered:

```tsx
        <PageTabs
          pages={config.pages}
          activeIndex={activePageIndex}
          onSelect={(i) => {
            setActivePageIndex(i);
            setSelectedCellIndex(null);
          }}
          onAdd={addPage}
          onRemove={removePage}
          onReorder={(newPages) => setConfig((cfg) => ({ ...cfg, pages: newPages }))}
        />
```

Add the new prop:

```tsx
        <PageTabs
          pages={config.pages}
          activeIndex={activePageIndex}
          onSelect={(i) => {
            setActivePageIndex(i);
            setSelectedCellIndex(null);
          }}
          onAdd={addPage}
          onRemove={removePage}
          onReorder={(newPages) => setConfig((cfg) => ({ ...cfg, pages: newPages }))}
          onRename={renamePage}
        />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/saas && npx vitest run components/printer/layout-editor/PageTabs.test.tsx components/printer/LayoutEditor.test.tsx`
Expected: PASS — all tests in both files green, including all 4 new `PageTabs.test.tsx` rename tests, the Task 1 click test, and every pre-existing `LayoutEditor.test.tsx` test (the `LayoutEditor` component itself didn't change its rendering behavior except passing one new prop, so its existing tests are unaffected).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/saas/components/printer/layout-editor/PageTabs.tsx apps/saas/components/printer/layout-editor/PageTabs.test.tsx apps/saas/components/printer/LayoutEditor.tsx
git commit -m "feat(saas): tambah rename halaman CYD editor -- ikon pensil, cegah nama kosong/duplikat"
```
