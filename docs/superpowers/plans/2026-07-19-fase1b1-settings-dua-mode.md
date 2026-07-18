# Fase 1b-1 — Panel Setting Dua-Mode + Storage Lokal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel `/settings` dua-mode di `apps/saas` — Free lihat setting default read-only+🔒, Beli edit + simpan lokal (IndexedDB) dan kalkulator langsung pakai setting custom-nya.

**Architecture:** `LocalSettings` (superset yang parametrize kalkulator) + `toSettingsV2` map ke `SettingsV2` core. Simpan per-`userId` di IndexedDB (`idb`). `compute.ts` diperluas menerima `LocalSettings` opsional (default = konstanta existing → **parity Free**). Panel + kalkulator pakai custom **hanya bila `paidCore`** (turunan entitlement server). Tanpa perubahan skema Prisma.

**Tech Stack:** Next.js 16, `@3pb/kalkulator-core` (`hitungKalkulasiV2`), `idb` (IndexedDB), `fake-indexeddb` (test), vitest 1.6.1 (+ jsdom).

## Global Constraints

- **Node 22 wajib.** Prefix tiap perintah shell: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`. Default Node v10 rusak.
- Filter `pnpm --filter @3pb/saas`. Package `@3pb/saas`.
- **Parity Free MUTLAK:** `fullView(c)` == `fullView(c, DEFAULT_LOCAL_SETTINGS)` == angka lama. `toSettingsV2(DEFAULT_LOCAL_SETTINGS)` deep-equal `defaultSettings` existing. Jangan regresi kalkulator Free.
- **Gating:** kalkulator & panel terapkan custom **hanya bila `paidCore`** (`capabilities(getEntitlement).paidCore`). Free/anon → default.
- **Scope 1b-1 = ubah-angka** (material FDM/SLA + 1 `mesinPerJam` + failureSpread + testLayer + margin A/B/C + resellerBulk + fee offline/shopee). BUKAN CRUD banyak profil. Komponen/labor/multi-plate/save = 1b-2.
- **Data Beli = lokal IndexedDB** per `userId`. **TANPA perubahan skema Prisma.**
- Deps baru: `idb` (dep), `fake-indexeddb` (dev). Jangan sentuh packages/*, apps/dashboard, apps/landing.
- Regresi test 1a-1/1a-2/1c existing tetap hijau. DRY, YAGNI, TDD, commit sering.
- Deploy homelab `:3300` (`bash apps/saas/deploy.sh`) = **GATED** (izin user; tak ada db push perlu karena skema tak berubah).

---

## File Structure

```
apps/saas/
  package.json                          # MODIFY: +idb, +fake-indexeddb(dev)
  lib/kalkulator/local-settings.ts      # NEW: LocalSettings + DEFAULT + toSettingsV2 + validate
  lib/kalkulator/local-settings.test.ts # NEW
  lib/kalkulator/compute.ts             # MODIFY: buildInputV2/compute/fullView terima LocalSettings
  lib/kalkulator/compute.test.ts        # MODIFY: +parity +custom-reflect
  lib/store/local-settings.ts           # NEW: idb load/save/reset per userId
  lib/store/local-settings.test.ts      # NEW (fake-indexeddb)
  components/SettingsPanel.tsx          # NEW: panel dua-mode
  components/settings-panel.test.tsx    # NEW (jsdom)
  app/settings/page.tsx                 # NEW: guard + paidCore → SettingsPanel
  components/Calculator.tsx             # MODIFY: props paidCore/userId + pakai settings + link ⚙ Setting
  app/page.tsx                          # MODIFY: teruskan paidCore + userId
```

---

### Task 1: `lib/kalkulator/local-settings.ts` — tipe + default + map + validasi (TDD)

**Files:**
- Create: `apps/saas/lib/kalkulator/local-settings.ts`, `apps/saas/lib/kalkulator/local-settings.test.ts`

**Interfaces:**
- Consumes: `SettingsV2` (`@3pb/kalkulator-core`), `defaultSettings`/`DEFAULT_MATERIAL`/`DEFAULT_MESIN_PER_JAM` (`./default-settings`).
- Produces: `LocalSettings` (interface), `DEFAULT_LOCAL_SETTINGS: LocalSettings`, `toSettingsV2(ls): SettingsV2`, `validateLocalSettings(ls): string[]`.

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/kalkulator/local-settings.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSettings } from "@/lib/kalkulator/default-settings";
import { DEFAULT_LOCAL_SETTINGS, toSettingsV2, validateLocalSettings } from "@/lib/kalkulator/local-settings";

describe("toSettingsV2 parity", () => {
  it("DEFAULT_LOCAL_SETTINGS → deep-equal defaultSettings existing", () => {
    expect(toSettingsV2(DEFAULT_LOCAL_SETTINGS)).toEqual(defaultSettings);
  });
  it("reflect margin.A + channel.shopee + failureSpread", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, margin: { A: 1.3, B: 1.5, C: 2 }, channels: { offline: 1, shopee: 1.5 }, failureSpreadPct: 70 };
    const s = toSettingsV2(ls);
    expect(s.marginMultipliers.A).toBe(1.3);
    expect(s.channels.find((c) => c.id === "shopee")!.feeMultiplier).toBe(1.5);
    expect(s.failureSpreadPct).toBe(70);
  });
});

describe("validateLocalSettings", () => {
  it("default valid → []", () => { expect(validateLocalSettings(DEFAULT_LOCAL_SETTINGS)).toEqual([]); });
  it("hpp ≤ 0 → error", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, material: { ...DEFAULT_LOCAL_SETTINGS.material, FDM: { ...DEFAULT_LOCAL_SETTINGS.material.FDM, hppPerGram: 0 } } };
    expect(validateLocalSettings(ls).length).toBeGreaterThan(0);
  });
  it("failure > 100 → error", () => {
    const ls = { ...DEFAULT_LOCAL_SETTINGS, material: { ...DEFAULT_LOCAL_SETTINGS.material, SLA: { ...DEFAULT_LOCAL_SETTINGS.material.SLA, failureRatePct: 150 } } };
    expect(validateLocalSettings(ls).length).toBeGreaterThan(0);
  });
  it("fee < 1 → error", () => {
    expect(validateLocalSettings({ ...DEFAULT_LOCAL_SETTINGS, channels: { offline: 0.5, shopee: 1.2 } }).length).toBeGreaterThan(0);
  });
  it("reseller ≤ 0 → error", () => {
    expect(validateLocalSettings({ ...DEFAULT_LOCAL_SETTINGS, resellerBulkMultiplier: 0 }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/kalkulator/local-settings.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/kalkulator/local-settings'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/kalkulator/local-settings.ts`**

```ts
import type { SettingsV2 } from "@3pb/kalkulator-core";
import { defaultSettings, DEFAULT_MATERIAL, DEFAULT_MESIN_PER_JAM } from "./default-settings";

export interface LocalSettings {
  material: {
    FDM: { hppPerGram: number; jualPerGram: number; failureRatePct: number };
    SLA: { hppPerGram: number; jualPerGram: number; failureRatePct: number };
  };
  mesinPerJam: number;
  failureSpreadPct: number;
  testLayerPct: number;
  margin: { A: number; B: number; C: number };
  resellerBulkMultiplier: number;
  channels: { offline: number; shopee: number };
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  material: { FDM: { ...DEFAULT_MATERIAL.FDM }, SLA: { ...DEFAULT_MATERIAL.SLA } },
  mesinPerJam: DEFAULT_MESIN_PER_JAM,
  failureSpreadPct: defaultSettings.failureSpreadPct,
  testLayerPct: defaultSettings.testLayerPct,
  margin: { ...defaultSettings.marginMultipliers },
  resellerBulkMultiplier: defaultSettings.resellerBulkMultiplier,
  channels: {
    offline: defaultSettings.channels.find((c) => c.id === "offline")!.feeMultiplier,
    shopee: defaultSettings.channels.find((c) => c.id === "shopee")!.feeMultiplier,
  },
};

export function toSettingsV2(ls: LocalSettings): SettingsV2 {
  return {
    failureSpreadPct: ls.failureSpreadPct,
    testLayerPct: ls.testLayerPct,
    marginMultipliers: { ...ls.margin },
    resellerBulkMultiplier: ls.resellerBulkMultiplier,
    channels: [
      { id: "offline", nama: "Offline", feeMultiplier: ls.channels.offline },
      { id: "shopee", nama: "Shopee", feeMultiplier: ls.channels.shopee },
    ],
  };
}

export function validateLocalSettings(ls: LocalSettings): string[] {
  const errs: string[] = [];
  const pos = (n: number, name: string) => { if (!(n > 0)) errs.push(`${name} harus > 0`); };
  const pct = (n: number, name: string) => { if (n < 0 || n > 100) errs.push(`${name} harus 0–100`); };
  for (const t of ["FDM", "SLA"] as const) {
    pos(ls.material[t].hppPerGram, `${t} harga modal`);
    pos(ls.material[t].jualPerGram, `${t} harga jual`);
    pct(ls.material[t].failureRatePct, `${t} failure rate`);
  }
  pos(ls.mesinPerJam, "Biaya mesin/jam");
  pct(ls.failureSpreadPct, "Failure spread");
  pct(ls.testLayerPct, "Test layer");
  pos(ls.margin.A, "Margin Kompetitif");
  pos(ls.margin.B, "Margin Standard");
  pos(ls.margin.C, "Margin Premium");
  pos(ls.resellerBulkMultiplier, "Reseller bulk");
  if (ls.channels.offline < 1) errs.push("Fee offline ≥ 1");
  if (ls.channels.shopee < 1) errs.push("Fee shopee ≥ 1");
  return errs;
}
```

- [ ] **Step 4: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/kalkulator/local-settings.test.ts
```
Expected: PASS (parity + reflect + validasi).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/kalkulator/local-settings.ts apps/saas/lib/kalkulator/local-settings.test.ts
git commit -m "feat(saas): LocalSettings + toSettingsV2 + validate (parity default, TDD)"
```

---

### Task 2: `compute.ts` terima LocalSettings (TDD parity + custom)

**Files:**
- Modify: `apps/saas/lib/kalkulator/compute.ts`, `apps/saas/lib/kalkulator/compute.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_LOCAL_SETTINGS`/`toSettingsV2`/`LocalSettings` (`./local-settings`), `hitungKalkulasiV2` (core).
- Produces: `buildInputV2(c, ls?)`, `compute(c, ls?)`, `fullView(c, ls?)` — `ls` default `DEFAULT_LOCAL_SETTINGS`. `CalcInput`/`FullView` tetap.

- [ ] **Step 1: Tambah failing test** ke `apps/saas/lib/kalkulator/compute.test.ts`

Tambahkan:
```ts
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

describe("compute custom settings", () => {
  const sample = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };
  it("parity: fullView(c) === fullView(c, DEFAULT_LOCAL_SETTINGS)", () => {
    expect(fullView(sample)).toEqual(fullView(sample, DEFAULT_LOCAL_SETTINGS));
  });
  it("naikkan margin.A → offline.A ikut naik", () => {
    const base = fullView(sample);
    const custom = { ...DEFAULT_LOCAL_SETTINGS, margin: { ...DEFAULT_LOCAL_SETTINGS.margin, A: DEFAULT_LOCAL_SETTINGS.margin.A + 1 } };
    const hi = fullView(sample, custom);
    const offBase = base.channels.find((c) => c.channelId === "offline")!.A;
    const offHi = hi.channels.find((c) => c.channelId === "offline")!.A;
    expect(offHi).toBeGreaterThan(offBase);
  });
  it("material custom (hpp FDM naik) → biaya modal naik", () => {
    const custom = { ...DEFAULT_LOCAL_SETTINGS, material: { ...DEFAULT_LOCAL_SETTINGS.material, FDM: { ...DEFAULT_LOCAL_SETTINGS.material.FDM, hppPerGram: DEFAULT_LOCAL_SETTINGS.material.FDM.hppPerGram + 500 } } };
    expect(fullView(sample, custom).biayaModal).toBeGreaterThan(fullView(sample).biayaModal);
  });
});
```

- [ ] **Step 2: Jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/kalkulator/compute.test.ts
```
Expected: FAIL — `fullView` belum terima arg kedua (TS error / test custom gagal).

- [ ] **Step 3: Ganti `apps/saas/lib/kalkulator/compute.ts`**

```ts
import {
  hitungKalkulasiV2,
  type KalkulasiInputV2,
  type HasilKalkulasiV2,
} from "@3pb/kalkulator-core";
import { defaultSettings } from "./default-settings";
import { DEFAULT_LOCAL_SETTINGS, toSettingsV2, type LocalSettings } from "./local-settings";

export { defaultSettings };

export interface CalcInput {
  gramasi: number;
  durasiJam: number;
  tipe: "FDM" | "SLA";
  hargaAktual?: { channelId: string; harga: number };
}

export function buildInputV2(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): KalkulasiInputV2 {
  const m = ls.material[c.tipe];
  return {
    plates: [{
      durasiJam: c.durasiJam,
      mesinPerJam: ls.mesinPerJam,
      mesinPerJamJual: ls.mesinPerJam,
      materials: [{
        gramasi: c.gramasi,
        hppPerGram: m.hppPerGram,
        jualPerGram: m.jualPerGram,
        failureRatePct: m.failureRatePct,
      }],
    }],
    batch: 1,
    komponen: [],
    labor: [],
    ...(c.hargaAktual ? { hargaAktual: c.hargaAktual } : {}),
  };
}

export function compute(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): HasilKalkulasiV2 {
  return hitungKalkulasiV2(buildInputV2(c, ls), toSettingsV2(ls));
}

export interface FullView {
  biayaModal: number;
  hargaJualMinimum: number;
  rekomendasi: number;
  channels: { channelId: string; nama: string; A: number; B: number; C: number; margin: number }[];
  status: HasilKalkulasiV2["status"];
}

export function fullView(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): FullView {
  const h = compute(c, ls);
  const settings = toSettingsV2(ls);
  const r = Math.round;
  const namaOf = (id: string) => settings.channels.find((ch) => ch.id === id)?.nama ?? id;
  const off = h.hargaPerChannel.find((ch) => ch.channelId === "offline")!;
  return {
    biayaModal: r(h.hppTotal),
    hargaJualMinimum: r(h.floorPrice),
    rekomendasi: r(off.B),
    channels: h.hargaPerChannel.map((ch) => ({
      channelId: ch.channelId,
      nama: namaOf(ch.channelId),
      A: r(ch.A),
      B: r(ch.B),
      C: r(ch.C),
      margin: r(ch.margin),
    })),
    status: h.status,
  };
}
```

- [ ] **Step 4: Jalankan — lolos (parity + custom)**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/kalkulator/compute.test.ts
```
Expected: PASS — test lama (single-arg `fullView`) tetap lulus (default) + 3 test custom baru.

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/kalkulator/compute.ts apps/saas/lib/kalkulator/compute.test.ts
git commit -m "feat(saas): compute terima LocalSettings (parity Free + custom reflect, TDD)"
```

---

### Task 3: `lib/store/local-settings.ts` — IndexedDB per userId (TDD)

**Files:**
- Create: `apps/saas/lib/store/local-settings.ts`, `apps/saas/lib/store/local-settings.test.ts`
- Modify: `apps/saas/package.json` (+`idb`, +`fake-indexeddb`)

**Interfaces:**
- Consumes: `DEFAULT_LOCAL_SETTINGS`/`LocalSettings` (`@/lib/kalkulator/local-settings`), `idb`.
- Produces: `loadSettings(userId): Promise<LocalSettings>` (default bila absen/error), `saveSettings(userId, s): Promise<void>`, `resetSettings(userId): Promise<void>`.

- [ ] **Step 1: Tambah deps ke `apps/saas/package.json`**

`dependencies`: `"idb": "^8.0.0"`. `devDependencies`: `"fake-indexeddb": "^6.0.0"`.

- [ ] **Step 2: Tulis failing test**

`apps/saas/lib/store/local-settings.test.ts`:
```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings, resetSettings } from "@/lib/store/local-settings";

beforeEach(async () => {
  // fresh DB tiap test
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("slizebiz-local"); r.onsuccess = () => res(); r.onerror = () => res(); });
});

describe("local-settings store", () => {
  it("load tanpa record → default", async () => {
    expect(await loadSettings("u1")).toEqual(DEFAULT_LOCAL_SETTINGS);
  });
  it("save → load roundtrip", async () => {
    const s = { ...DEFAULT_LOCAL_SETTINGS, mesinPerJam: 7000 };
    await saveSettings("u1", s);
    expect((await loadSettings("u1")).mesinPerJam).toBe(7000);
  });
  it("dua userId terpisah", async () => {
    await saveSettings("u1", { ...DEFAULT_LOCAL_SETTINGS, mesinPerJam: 7000 });
    expect((await loadSettings("u2")).mesinPerJam).toBe(DEFAULT_LOCAL_SETTINGS.mesinPerJam);
  });
  it("reset → default", async () => {
    await saveSettings("u1", { ...DEFAULT_LOCAL_SETTINGS, mesinPerJam: 7000 });
    await resetSettings("u1");
    expect(await loadSettings("u1")).toEqual(DEFAULT_LOCAL_SETTINGS);
  });
});
```

- [ ] **Step 3: Install + jalankan — gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm install
pnpm --filter @3pb/saas test lib/store/local-settings.test.ts
```
Expected: `pnpm install` menambah idb/fake-indexeddb; test FAIL — `Cannot find module '@/lib/store/local-settings'`.

- [ ] **Step 4: Implementasi `apps/saas/lib/store/local-settings.ts`**

```ts
import { openDB, type IDBPDatabase } from "idb";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";

const DB_NAME = "slizebiz-local";
const STORE = "settings";

async function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "userId" });
    },
  });
}

/** Muat setting user; default bila tak ada / IndexedDB gagal. */
export async function loadSettings(userId: string): Promise<LocalSettings> {
  try {
    const rec = (await (await db()).get(STORE, userId)) as { userId: string; settings: LocalSettings } | undefined;
    return rec?.settings ?? DEFAULT_LOCAL_SETTINGS;
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
}

export async function saveSettings(userId: string, settings: LocalSettings): Promise<void> {
  await (await db()).put(STORE, { userId, settings });
}

export async function resetSettings(userId: string): Promise<void> {
  try {
    await (await db()).delete(STORE, userId);
  } catch {
    /* noop */
  }
}
```

- [ ] **Step 5: Jalankan — lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/store/local-settings.test.ts
```
Expected: PASS (roundtrip/default/reset/dua-user).

- [ ] **Step 6: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/store/local-settings.ts apps/saas/lib/store/local-settings.test.ts apps/saas/package.json pnpm-lock.yaml
git commit -m "feat(saas): store IndexedDB local-settings per userId + idb dep (TDD)"
```

---

### Task 4: `SettingsPanel` + `/settings` (dua-mode)

**Files:**
- Create: `apps/saas/components/SettingsPanel.tsx`, `apps/saas/app/settings/page.tsx`, `apps/saas/components/settings-panel.test.tsx`

**Interfaces:**
- Consumes: `DEFAULT_LOCAL_SETTINGS`/`validateLocalSettings`/`LocalSettings` (`@/lib/kalkulator/local-settings`), `loadSettings`/`saveSettings`/`resetSettings` (`@/lib/store/local-settings`), `MARGIN_TIER_LABEL` (core), `auth`/`getEntitlement`/`capabilities`.
- Produces: `<SettingsPanel editable={boolean} userId={string|null} />`; halaman `/settings` (login-gated, `editable = paidCore`).

- [ ] **Step 1: `apps/saas/components/SettingsPanel.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { MARGIN_TIER_LABEL } from "@3pb/kalkulator-core";
import { GlassButton, GlassInput } from "@3pb/ui";
import { DEFAULT_LOCAL_SETTINGS, validateLocalSettings, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings, resetSettings } from "@/lib/store/local-settings";

function NumField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <label className="text-[11px] g-t3 flex flex-col">
      {label}
      <GlassInput type="number" inputMode="decimal" value={String(value)} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-1" />
    </label>
  );
}

function Group({ title, locked, children }: { title: string; locked: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12px] font-medium g-t2 flex items-center gap-2">
        {title} {locked && <span className="text-[10px] g-t5">🔒 Edit di Beli</span>}
      </h2>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

export function SettingsPanel({ editable, userId }: { editable: boolean; userId: string | null }) {
  const [s, setS] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const disabled = !editable;

  useEffect(() => { if (editable && userId) loadSettings(userId).then(setS); }, [editable, userId]);

  const setMat = (t: "FDM" | "SLA", k: "hppPerGram" | "jualPerGram" | "failureRatePct", n: number) =>
    setS((p) => ({ ...p, material: { ...p.material, [t]: { ...p.material[t], [k]: n } } }));
  const setMargin = (k: "A" | "B" | "C", n: number) => setS((p) => ({ ...p, margin: { ...p.margin, [k]: n } }));
  const setChan = (k: "offline" | "shopee", n: number) => setS((p) => ({ ...p, channels: { ...p.channels, [k]: n } }));

  async function save() {
    const errs = validateLocalSettings(s);
    if (errs.length) { setMsg(errs[0]); return; }
    if (!userId) return;
    setSaving(true);
    try { await saveSettings(userId, s); setMsg("Tersimpan."); }
    catch { setMsg("Gagal simpan, coba lagi."); }
    setSaving(false);
  }
  async function reset() {
    if (!userId) return;
    await resetSettings(userId);
    setS(DEFAULT_LOCAL_SETTINGS);
    setMsg("Direset ke default.");
  }

  return (
    <div className="flex flex-col gap-5">
      <Group title="Material" locked={disabled}>
        <NumField label="FDM harga modal/g" value={s.material.FDM.hppPerGram} disabled={disabled} onChange={(n) => setMat("FDM", "hppPerGram", n)} />
        <NumField label="FDM harga jual/g" value={s.material.FDM.jualPerGram} disabled={disabled} onChange={(n) => setMat("FDM", "jualPerGram", n)} />
        <NumField label="FDM failure %" value={s.material.FDM.failureRatePct} disabled={disabled} onChange={(n) => setMat("FDM", "failureRatePct", n)} />
        <NumField label="SLA harga modal/g" value={s.material.SLA.hppPerGram} disabled={disabled} onChange={(n) => setMat("SLA", "hppPerGram", n)} />
        <NumField label="SLA harga jual/g" value={s.material.SLA.jualPerGram} disabled={disabled} onChange={(n) => setMat("SLA", "jualPerGram", n)} />
        <NumField label="SLA failure %" value={s.material.SLA.failureRatePct} disabled={disabled} onChange={(n) => setMat("SLA", "failureRatePct", n)} />
      </Group>
      <Group title="Mesin & prototype" locked={disabled}>
        <NumField label="Biaya mesin/jam" value={s.mesinPerJam} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, mesinPerJam: n }))} />
        <NumField label="Failure spread %" value={s.failureSpreadPct} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, failureSpreadPct: n }))} />
        <NumField label="Test layer %" value={s.testLayerPct} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, testLayerPct: n }))} />
      </Group>
      <Group title="Margin & reseller" locked={disabled}>
        <NumField label={`Margin ${MARGIN_TIER_LABEL.A}`} value={s.margin.A} disabled={disabled} onChange={(n) => setMargin("A", n)} />
        <NumField label={`Margin ${MARGIN_TIER_LABEL.B}`} value={s.margin.B} disabled={disabled} onChange={(n) => setMargin("B", n)} />
        <NumField label={`Margin ${MARGIN_TIER_LABEL.C}`} value={s.margin.C} disabled={disabled} onChange={(n) => setMargin("C", n)} />
        <NumField label="Reseller bulk ×" value={s.resellerBulkMultiplier} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, resellerBulkMultiplier: n }))} />
      </Group>
      <Group title="Fee channel" locked={disabled}>
        <NumField label="Offline ×" value={s.channels.offline} disabled={disabled} onChange={(n) => setChan("offline", n)} />
        <NumField label="Shopee ×" value={s.channels.shopee} disabled={disabled} onChange={(n) => setChan("shopee", n)} />
      </Group>

      {editable ? (
        <div className="flex items-center gap-3">
          <GlassButton onClick={save} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</GlassButton>
          <button type="button" onClick={reset} className="text-[12px] g-t4 underline">Reset ke default</button>
          {msg && <span className="text-[12px] g-t4">{msg}</span>}
        </div>
      ) : (
        <a href="/beli" className="g-btn-ghost rounded-[10px] px-4 h-9 inline-flex items-center text-sm self-start">Buka semua ini di Beli →</a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `apps/saas/app/settings/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { SettingsPanel } from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const ent = await getEntitlement(userId);
  const paidCore = capabilities(ent).paidCore;
  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-lg font-semibold g-t1 mb-1">Setting kalkulator</h1>
      {!paidCore && <p className="text-[12px] g-t4 mb-4">Ini nilai default (read-only). Beli untuk mengubah & memakainya di kalkulatormu.</p>}
      <SettingsPanel editable={paidCore} userId={userId} />
    </main>
  );
}
```

- [ ] **Step 3: Component test** `apps/saas/components/settings-panel.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const saveMock = vi.fn(); const resetMock = vi.fn();
vi.mock("@/lib/store/local-settings", async () => {
  const actual = await vi.importActual<any>("@/lib/kalkulator/local-settings");
  return { loadSettings: vi.fn(async () => actual.DEFAULT_LOCAL_SETTINGS), saveSettings: (...a: unknown[]) => saveMock(...a), resetSettings: (...a: unknown[]) => resetMock(...a) };
});
import { SettingsPanel } from "@/components/SettingsPanel";

beforeEach(() => { saveMock.mockReset(); resetMock.mockReset(); });

describe("SettingsPanel", () => {
  it("Free (editable=false) → input disabled + CTA Beli, tak ada tombol Simpan", () => {
    render(<SettingsPanel editable={false} userId="u1" />);
    expect((screen.getByLabelText(/FDM harga modal/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Buka semua ini di Beli/i)).toBeTruthy();
    expect(screen.queryByText("Simpan")).toBeNull();
  });
  it("Beli (editable=true) → Simpan panggil saveSettings", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith("u1", expect.any(Object)));
  });
  it("Beli → Reset panggil resetSettings", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    fireEvent.click(screen.getByText("Reset ke default"));
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith("u1"));
  });
});
```

- [ ] **Step 4: Jalankan test + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test components/settings-panel.test.tsx
pnpm --filter @3pb/saas build
```
Expected: test PASS (Free disabled+CTA, Beli save/reset); build sukses (`/settings` route).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/components/SettingsPanel.tsx apps/saas/app/settings apps/saas/components/settings-panel.test.tsx
git commit -m "feat(saas): SettingsPanel dua-mode + halaman /settings (Free read-only / Beli editable)"
```

---

### Task 5: Kalkulator pakai setting custom + link ⚙ Setting

**Files:**
- Modify: `apps/saas/components/Calculator.tsx`, `apps/saas/app/page.tsx`, `apps/saas/components/calculator.test.tsx`

**Interfaces:**
- Consumes: `fullView`/`CalcInput` (`@/lib/kalkulator/compute`), `DEFAULT_LOCAL_SETTINGS`/`LocalSettings` (`@/lib/kalkulator/local-settings`), `loadSettings` (`@/lib/store/local-settings`), `getEntitlement`/`capabilities` (`@/lib/entitlement`).
- Produces: `<Calculator authenticated paidCore? userId? />` — pakai custom bila `paidCore && userId`, else default.

- [ ] **Step 1: Modify `apps/saas/components/Calculator.tsx`**

Tambah import + props + state settings, dan pakai di `fullView`. Ubah signature + tambahan:
```tsx
// import tambahan (di atas):
import { useEffect } from "react";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings } from "@/lib/store/local-settings";

// ubah signature:
export function Calculator({ authenticated, paidCore = false, userId = null }: { authenticated: boolean; paidCore?: boolean; userId?: string | null }) {
  // ...state existing...
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  useEffect(() => { if (paidCore && userId) loadSettings(userId).then(setSettings); }, [paidCore, userId]);
  // ubah view:
  const view = valid ? fullView({ gramasi: g, durasiJam: d, tipe }, settings) : null;
```
Dan tambah link ⚙ Setting di header (setelah `{authenticated && <LogoutButton .../>}`):
```tsx
        {authenticated && <a href="/settings" className="text-[12px] g-t4 underline" title="Setting kalkulator">⚙ Setting</a>}
```
(Pastikan header pakai `ml-auto`/gap agar rapi — LogoutButton sudah `ml-auto`; taruh link Setting SEBELUM LogoutButton, dan pindah `ml-auto` ke link Setting bila perlu agar dua-duanya di kanan. Contoh: `<a ... className="text-[12px] g-t4 underline ml-auto">⚙ Setting</a>` lalu `<LogoutButton />` tanpa ml-auto.)

- [ ] **Step 2: Modify `apps/saas/app/page.tsx`** — hitung paidCore + userId, teruskan

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { Calculator } from "@/components/Calculator";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  return <Calculator authenticated={true} paidCore={capabilities(ent).paidCore} userId={session.user.id} />;
}
```

- [ ] **Step 3: Tambah gating test** ke `apps/saas/components/calculator.test.tsx`

Tambahkan (mock store):
```tsx
vi.mock("@/lib/store/local-settings", () => ({ loadSettings: vi.fn(async () => ({})) }));
import { loadSettings } from "@/lib/store/local-settings";

describe("Calculator gating settings", () => {
  it("paidCore=false → tidak load settings custom", () => {
    (loadSettings as any).mockClear();
    render(<Calculator authenticated={true} paidCore={false} userId="u1" />);
    expect(loadSettings).not.toHaveBeenCalled();
  });
  it("paidCore=true + userId → load settings", () => {
    (loadSettings as any).mockClear();
    render(<Calculator authenticated={true} paidCore={true} userId="u1" />);
    expect(loadSettings).toHaveBeenCalledWith("u1");
  });
});
```
> Catatan: `loadSettings` di-mock kembalikan `{}` (bukan LocalSettings valid) — test ini hanya cek dipanggil/tidak, bukan angka. `.then(setSettings)` menerima `{}`; karena test tak me-render hasil kalkulasi setelah load (cukup assert panggilan), aman. Bila render sempat pakai `{}` dan crash, ubah mock kembalikan `DEFAULT_LOCAL_SETTINGS` (import dari `@/lib/kalkulator/local-settings`).

- [ ] **Step 4: Jalankan test + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test components/calculator.test.tsx
pnpm --filter @3pb/saas build
```
Expected: test PASS (3 lama + 2 gating); build sukses.

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/components/Calculator.tsx apps/saas/app/page.tsx apps/saas/components/calculator.test.tsx
git commit -m "feat(saas): kalkulator pakai setting custom saat Beli + link ⚙ Setting (gating paidCore)"
```

---

### Task 6: Verifikasi akhir + docs (deploy GATED)

**Files:**
- Modify: `apps/saas/README.md`

- [ ] **Step 1: Update `apps/saas/README.md`** — tambah baris Arsitektur:

```markdown
- Setting (Beli, 1b-1): panel `/settings` dua-mode — Free lihat default read-only+🔒, Beli edit + simpan **lokal (IndexedDB, `lib/store/local-settings.ts`)**. Kalkulator pakai setting custom hanya bila `paidCore` (`compute.ts` terima `LocalSettings`; parity Free dijaga). Scope: material FDM/SLA, mesin/jam, failure/test, margin, reseller, fee channel. Komponen/labor/multi-plate/save = 1b-2.
```

- [ ] **Step 2: Seluruh suite + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas exec prisma generate
pnpm turbo test
pnpm turbo build
```
Expected: semua package hijau (termasuk local-settings/store/compute/settings-panel/calculator baru + test 1a-1/1a-2/1c tetap lulus); build sukses.

- [ ] **Step 3: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/README.md
git commit -m "docs(saas): README setting dua-mode 1b-1"
```

- [ ] **Step 4: Deploy homelab (GATED — controller, izin user)**

`bash apps/saas/deploy.sh` — **tak ada db push perlu** (skema Prisma tak berubah; setting Beli murni client IndexedDB). Smoke: `/settings` login → Free lihat read-only+🔒; (Beli) edit → Simpan → refresh kalkulator → angka ikut berubah.

---

## Self-Review

**1. Spec coverage:** LocalSettings+DEFAULT+toSettingsV2+validate → T1 ✅ (§2); compute terima LocalSettings + parity → T2 ✅ (§4/§6); store IndexedDB per userId + fallback → T3 ✅ (§2/§5); panel dua-mode /settings → T4 ✅ (§3); kalkulator pakai custom saat paidCore + link Setting → T5 ✅ (§4); reseller editable → T1/T4 ✅; validasi → T1 ✅ (§5); docs/deploy → T6 ✅. Reset default → T4 ✅. Parity Free mutlak → T2 test ✅.

**2. Placeholder scan:** tak ada TBD/TODO. Catatan mock `loadSettings` di T5 test diberi fallback eksplisit (bukan placeholder).

**3. Type consistency:** `LocalSettings` (T1) dipakai T2/T3/T4/T5. `toSettingsV2`/`DEFAULT_LOCAL_SETTINGS`/`validateLocalSettings` (T1) konsisten. `loadSettings/saveSettings/resetSettings(userId)` (T3) dipakai T4/T5. `fullView(c, ls?)` (T2) dipakai T5. `capabilities(ent).paidCore` (existing) dipakai T4/T5. Props `Calculator{authenticated, paidCore?, userId?}` konsisten T5↔page.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-19-fase1b1-settings-dua-mode.md`. Dua opsi eksekusi:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review antar task.
**2. Inline Execution** — via executing-plans, batch + checkpoint.

**Which approach?**
