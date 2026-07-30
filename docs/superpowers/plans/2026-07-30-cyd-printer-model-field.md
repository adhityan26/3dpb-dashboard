# CYD Printer Model Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `type` field in the `3dpb/printers` MQTT payload carry the printer's actual model (e.g. `"P1S"`) instead of its connector kind (`"bambu"`/`"moonraker"`), by adding a `model` field to `Device` in the SaaS, exposing it through the existing Agent↔SaaS API, and having the Agent use it (with a fallback) when building the payload.

**Architecture:** `Device.model` (nullable Postgres column, SaaS) flows unchanged through the existing `GET /api/agent/devices` response into the Agent's `SaasDevice`/`CachedDevice`/`PairedDevice` types, and `engine-manager.ts` uses it as `DeviceConfig.type` with a per-connector fallback string when absent. A new `PATCH /api/agent/devices/{shortCode}` endpoint lets the Agent write a model back after pairing (best-effort, non-blocking). The SaaS UI gets a model input (with suggestions) and a nudge for devices missing one. `packages/printer-monitor-core` is untouched.

**Tech Stack:** Next.js 16 (SaaS, App Router route handlers), Prisma 7 + `@prisma/adapter-pg` (Postgres), Electron + React 19 (Agent), Vitest + Testing Library, pnpm workspaces + Turborepo.

## Global Constraints

- Firmware buffer is `char type[12]` (`~/Documents/Project/3pb-monitoring-display/apps/internal/src/screens/printers.h:9`) — effective capacity **11 bytes**. Validate with `Buffer.byteLength(value, "utf8")`, never `.length`.
- `Device.model` is nullable, no backfill for existing rows (spec §7).
- SaaS is the single source of truth for `model`. The Agent never invents or persists a model independent of what SaaS returns/accepts.
- Empty string in any model-accepting API body means "clear the model" (→ `null`), not an error. A field entirely absent from the body means "leave unchanged."
- `packages/printer-monitor-core` (`types.ts`, `payload.ts`) is NOT modified — `DeviceConfig.type` already means "model."
- Node 22 required for all commands below: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- Full spec: `docs/superpowers/specs/2026-07-30-cyd-printer-model-field-design.md`.

---

### Task 1: `maxPrinterModelLength` limit in `packages/cyd-layout-schema`

**Files:**
- Modify: `packages/cyd-layout-schema/src/types.ts:57-66` (the `LAYOUT_LIMITS` object)
- Test: `packages/cyd-layout-schema/src/types.test.ts` (create)

**Interfaces:**
- Produces: `LAYOUT_LIMITS.maxPrinterModelLength: number` (value `11`), importable as `import { LAYOUT_LIMITS } from "@3pb/cyd-layout-schema"`.

- [ ] **Step 1: Write the failing test**

Create `packages/cyd-layout-schema/src/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LAYOUT_LIMITS } from './types'

describe('LAYOUT_LIMITS.maxPrinterModelLength', () => {
  it('cocok kapasitas buffer firmware char type[12] (11 byte efektif)', () => {
    expect(LAYOUT_LIMITS.maxPrinterModelLength).toBe(11)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @3pb/cyd-layout-schema test`
Expected: FAIL — `LAYOUT_LIMITS.maxPrinterModelLength` is `undefined`, `toBe(11)` fails.

- [ ] **Step 3: Add the constant**

In `packages/cyd-layout-schema/src/types.ts`, inside the `LAYOUT_LIMITS` object (after `maxPrinterIdLength: 23,`), add:

```ts
  // Batas nilai `Device.model` (SaaS) yang dikirim Agent sebagai field `type` payload
  // 3dpb/printers — cocok kapasitas `char type[12]` firmware (11 byte efektif sebelum
  // null-terminator). BUKAN bagian validasi layout cell seperti limit lain di atas; dipakai
  // langsung oleh apps/saas/lib/devices/service.ts saat validasi input model.
  maxPrinterModelLength: 11,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @3pb/cyd-layout-schema test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cyd-layout-schema/src/types.ts packages/cyd-layout-schema/src/types.test.ts
git commit -m "feat(cyd-layout-schema): tambah LAYOUT_LIMITS.maxPrinterModelLength"
```

---

### Task 2: `Device.model` column + validation in SaaS service layer

**Files:**
- Modify: `apps/saas/prisma/schema.prisma:112-123` (`Device` model)
- Modify: `apps/saas/lib/devices/errors.ts`
- Modify: `apps/saas/lib/devices/service.ts`
- Modify: `apps/saas/package.json` (add `@3pb/cyd-layout-schema` — already present as a dependency, no change needed; verify only)
- Test: `apps/saas/lib/devices/service.test.ts`

**Interfaces:**
- Consumes: `LAYOUT_LIMITS` from Task 1 (`@3pb/cyd-layout-schema`).
- Produces:
  - `InvalidDeviceModel` class (`status = 400`, `value: string`) in `errors.ts`.
  - `createDevice(userId, { label, printerType, model? }): Promise<Device>` — `model?: string`.
  - `updateDevice(userId, id, { label?, printerType?, model? }): Promise<Device>` — `model?: string`.
  - `updateDeviceModelByShortCode(userId, shortCode, model): Promise<Device>` (new export).
  - Prisma `Device` rows now have `model: string | null`.

- [ ] **Step 1: Add the column to the schema**

In `apps/saas/prisma/schema.prisma`, change the `Device` model:

```prisma
model Device {
  id          String   @id @default(cuid())
  shortCode   String   @unique
  userId      String
  label       String
  printerType String
  model       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 2: Regenerate the Prisma Client types**

Run: `pnpm --filter @3pb/saas exec prisma generate`
Expected: succeeds without needing a live database (generation reads only `schema.prisma`); `Device` type in `@prisma/client` now has `model: string | null`.

Note: this does NOT apply the column to any real Postgres database — that's `pnpm --filter @3pb/saas db:push`, a deploy-time step (see spec §8), not needed to run the unit tests in this task (they mock `@/lib/db` entirely) and not run as part of this plan.

- [ ] **Step 3: Write the failing tests**

Add to `apps/saas/lib/devices/service.test.ts`, inside the existing `describe("createDevice", ...)` block (after the existing tests, before its closing `});`):

```ts
  it("simpan model kalau diisi (trim dulu)", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);
    await createDevice("u1", { label: "Printer A", printerType: "bambu", model: "  P1S  " });
    expect(tx.device.create).toHaveBeenCalledWith({
      data: { userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567", model: "P1S" },
    });
  });

  it("model kosong/whitespace -> disimpan sebagai null", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);
    await createDevice("u1", { label: "Printer A", printerType: "bambu", model: "   " });
    expect(tx.device.create).toHaveBeenCalledWith({
      data: { userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567", model: null },
    });
  });

  it("model tak diisi sama sekali (undefined) -> tak masuk ke data create sebagai key eksplisit", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);
    await createDevice("u1", { label: "Printer A", printerType: "bambu" });
    expect(tx.device.create).toHaveBeenCalledWith({
      data: { userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567" },
    });
  });

  it("model >11 byte -> InvalidDeviceModel, tolak SEBELUM buka transaksi", async () => {
    await expect(createDevice("u1", { label: "X", printerType: "bambu", model: "ABCDEFGHIJKL" })).rejects.toThrow(InvalidDeviceModel);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("model persis 11 byte ASCII lolos, 12 byte ditolak (batas firmware char type[12])", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    mockTx(0, 2);
    await expect(createDevice("u1", { label: "X", printerType: "bambu", model: "12345678901" })).resolves.toBeTruthy();
    await expect(createDevice("u1", { label: "X", printerType: "bambu", model: "123456789012" })).rejects.toThrow(InvalidDeviceModel);
  });

  it("validasi model pakai byte length, bukan .length -- string multibyte pendek tapi berat byte harus ditolak", async () => {
    // "文" (U+6587) = 3 byte UTF-8. 4 karakter = 12 byte > batas 11, walau .length cuma 4.
    await expect(createDevice("u1", { label: "X", printerType: "bambu", model: "文文文文" })).rejects.toThrow(InvalidDeviceModel);
  });
```

Add a new `describe("updateDevice", ...)` block of tests — append these `it` blocks inside the EXISTING `describe("updateDevice", ...)` block (after its current two tests, before the closing `});`):

```ts
  it("update model (trim, kosong -> null)", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1" });
    (prisma.device.update as any).mockResolvedValue({ id: "d1", model: "P1S" });
    await updateDevice("u1", "d1", { model: "  P1S  " });
    expect(prisma.device.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { model: "P1S" } });
  });

  it("model tak dioper (undefined) -> tak ikut di data update sama sekali", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1" });
    (prisma.device.update as any).mockResolvedValue({ id: "d1" });
    await updateDevice("u1", "d1", { label: "Baru" });
    expect(prisma.device.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { label: "Baru" } });
  });

  it("model >11 byte saat update -> InvalidDeviceModel", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1" });
    await expect(updateDevice("u1", "d1", { model: "ABCDEFGHIJKL" })).rejects.toThrow(InvalidDeviceModel);
    expect(prisma.device.update).not.toHaveBeenCalled();
  });
```

Add a new `describe` block at the end of the file (before the final `describe("PRINTER_TYPES", ...)` block or after it — either position is fine, place it right after the `describe("updateDevice", ...)` block closes):

```ts
describe("updateDeviceModelByShortCode", () => {
  it("update model by shortCode kalau device milik user", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1", shortCode: "abc1234567" });
    (prisma.device.update as any).mockResolvedValue({ id: "d1", model: "P1S" });
    await updateDeviceModelByShortCode("u1", "abc1234567", "P1S");
    expect(prisma.device.findUnique).toHaveBeenCalledWith({ where: { shortCode: "abc1234567" } });
    expect(prisma.device.update).toHaveBeenCalledWith({ where: { shortCode: "abc1234567" }, data: { model: "P1S" } });
  });

  it("throw DeviceNotFound kalau shortCode tak ada", async () => {
    (prisma.device.findUnique as any).mockResolvedValue(null);
    await expect(updateDeviceModelByShortCode("u1", "tidak-ada", "P1S")).rejects.toThrow(DeviceNotFound);
  });

  it("throw DeviceNotFound kalau shortCode milik user LAIN (jangan bocorkan keberadaannya)", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u2", shortCode: "abc1234567" });
    await expect(updateDeviceModelByShortCode("u1", "abc1234567", "P1S")).rejects.toThrow(DeviceNotFound);
    expect(prisma.device.update).not.toHaveBeenCalled();
  });

  it("model >11 byte -> InvalidDeviceModel", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1", shortCode: "abc1234567" });
    await expect(updateDeviceModelByShortCode("u1", "abc1234567", "ABCDEFGHIJKL")).rejects.toThrow(InvalidDeviceModel);
  });
});
```

Update the imports at the top of `apps/saas/lib/devices/service.test.ts`:

```ts
import { listDevices, createDevice, updateDevice, updateDeviceModelByShortCode, deleteDevice, getDeviceLimit, PRINTER_TYPES } from "./service";
import { SlotLimitExceeded, InvalidPrinterType, InvalidDeviceModel, DeviceNotFound } from "./errors";
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas test -- service.test.ts`
Expected: FAIL — `InvalidDeviceModel` and `updateDeviceModelByShortCode` are not exported yet; `model` isn't handled.

- [ ] **Step 5: Add `InvalidDeviceModel` to `errors.ts`**

Append to `apps/saas/lib/devices/errors.ts`:

```ts
export class InvalidDeviceModel extends Error {
  status = 400;
  constructor(public value: string) {
    super(`model tidak valid (kosongkan atau maks ${11} byte): ${value}`);
    this.name = "InvalidDeviceModel";
  }
}
```

- [ ] **Step 6: Implement validation + wiring in `service.ts`**

In `apps/saas/lib/devices/service.ts`:

Add import (with the existing imports):

```ts
import { LAYOUT_LIMITS } from "@3pb/cyd-layout-schema";
import { SlotLimitExceeded, InvalidPrinterType, InvalidDeviceModel, DeviceNotFound } from "./errors";
```

Add the helper right after `assertValidPrinterType`:

```ts
/** Trim; kosong/whitespace -> null (mengosongkan model itu sah, bukan error); >11 byte (batas
 * `char type[12]` firmware, LAYOUT_LIMITS.maxPrinterModelLength) -> InvalidDeviceModel. Byte
 * length, BUKAN `.length` -- buffer firmware dihitung per byte, string multibyte pendek secara
 * karakter bisa tetap kepanjangan secara byte. */
function normalizeDeviceModel(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (Buffer.byteLength(trimmed, "utf8") > LAYOUT_LIMITS.maxPrinterModelLength) {
    throw new InvalidDeviceModel(trimmed);
  }
  return trimmed;
}
```

Change `createDevice`'s signature and body:

```ts
export async function createDevice(
  userId: string,
  input: { label: string; printerType: string; model?: string }
): Promise<Device> {
  assertValidPrinterType(input.printerType);
  const model = input.model !== undefined ? normalizeDeviceModel(input.model) : undefined;

  const fallbackLimit = await getConfigInt("printer.defaultSlots", 1);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "Entitlement" ("id", "userId", "updatedAt") VALUES (${crypto.randomUUID()}, ${userId}, now()) ON CONFLICT ("userId") DO NOTHING`;
    await tx.$queryRaw`SELECT 1 FROM "Entitlement" WHERE "userId" = ${userId} FOR UPDATE`;
    const entitlement = await tx.entitlement.findUnique({ where: { userId } });
    const limit = entitlement?.printerSlots ?? fallbackLimit;
    const count = await tx.device.count({ where: { userId } });
    if (count >= limit) throw new SlotLimitExceeded(limit);

    const shortCode = await generateUniqueShortCode(tx);
    return tx.device.create({
      data: {
        userId,
        label: input.label,
        printerType: input.printerType,
        shortCode,
        ...(model !== undefined && { model }),
      },
    });
  });
}
```

Change `updateDevice`:

```ts
export async function updateDevice(
  userId: string,
  id: string,
  input: { label?: string; printerType?: string; model?: string }
): Promise<Device> {
  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) throw new DeviceNotFound();
  if (input.printerType !== undefined) assertValidPrinterType(input.printerType);
  const model = input.model !== undefined ? normalizeDeviceModel(input.model) : undefined;
  return prisma.device.update({
    where: { id },
    data: {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.printerType !== undefined && { printerType: input.printerType }),
      ...(input.model !== undefined && { model }),
    },
  });
}
```

Add the new export, right after `updateDevice`:

```ts
/** Dipakai HANYA oleh PATCH /api/agent/devices/[shortCode] -- Agent tak tahu `id` internal Device,
 * cuma `shortCode` (kunci korelasi yang sama dipakai di seluruh kontrak Agent<->SaaS). */
export async function updateDeviceModelByShortCode(userId: string, shortCode: string, model: string): Promise<Device> {
  const existing = await prisma.device.findUnique({ where: { shortCode } });
  if (!existing || existing.userId !== userId) throw new DeviceNotFound();
  return prisma.device.update({ where: { shortCode }, data: { model: normalizeDeviceModel(model) } });
}
```

- [ ] **Step 7: Update the mocked `prisma` in the test file's `vi.mock("@/lib/db", ...)` if needed**

Check `apps/saas/lib/devices/service.test.ts:3-11` — `prisma.device` mock already includes `findUnique` and `update`, so no change needed there. Confirm `tx.device` inside `mockTx()` (lines 35-49) also already has `create` — no change needed.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas test -- service.test.ts`
Expected: PASS (all existing + new tests)

- [ ] **Step 9: Commit**

```bash
git add apps/saas/prisma/schema.prisma apps/saas/lib/devices/errors.ts apps/saas/lib/devices/service.ts apps/saas/lib/devices/service.test.ts
git commit -m "feat(saas): tambah Device.model + validasi (byte-length, batas buffer firmware)"
```

---

### Task 3: SaaS routes — existing device routes + new Agent PATCH endpoint

**Files:**
- Modify: `apps/saas/app/api/devices/route.ts`
- Modify: `apps/saas/app/api/devices/[id]/route.ts`
- Create: `apps/saas/app/api/agent/devices/[shortCode]/route.ts`
- Test: `apps/saas/app/api/devices/route.test.ts`
- Test: `apps/saas/app/api/devices/[id]/route.test.ts`
- Test: `apps/saas/app/api/agent/devices/[shortCode]/route.test.ts` (create)

**Interfaces:**
- Consumes: `createDevice`, `updateDevice`, `updateDeviceModelByShortCode`, `InvalidDeviceModel`, `DeviceNotFound` from Task 2. `requireAgentToken` from `@/lib/agent-auth` (existing, unchanged).
- Produces: `POST /api/devices` and `PATCH /api/devices/[id]` accept optional `model`; new `PATCH /api/agent/devices/[shortCode]` accepts `{ model: string }`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/saas/app/api/devices/route.test.ts`, inside `describe("POST /api/devices", ...)`:

```ts
  it("200 + model tersimpan kalau diisi", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    (createDevice as any).mockResolvedValue({ id: "new-d", model: "P1S" });
    const res = await POST(req({ label: "A", printerType: "bambu", model: "P1S" }));
    expect(res.status).toBe(200);
    expect(createDevice).toHaveBeenCalledWith("u1", { label: "A", printerType: "bambu", model: "P1S" });
  });

  it("400 kalau InvalidDeviceModel", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    (createDevice as any).mockRejectedValue(new InvalidDeviceModel("terlalu panjang sekali"));
    const res = await POST(req({ label: "A", printerType: "bambu", model: "terlalu panjang sekali" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_device_model");
  });
```

Add `InvalidDeviceModel` to the existing import from `"@/lib/devices/errors"` at the top of the file:

```ts
import { SlotLimitExceeded, InvalidDeviceModel } from "@/lib/devices/errors";
```

Append to `apps/saas/app/api/devices/[id]/route.test.ts`, inside `describe("PATCH /api/devices/[id]", ...)`:

```ts
  it("200 + model diteruskan kalau diisi", async () => {
    loginAs(true);
    (updateDevice as any).mockResolvedValue({ id: "d1", model: "P1S" });
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ model: "P1S" }) }), ctx("d1"));
    expect(res.status).toBe(200);
    expect(updateDevice).toHaveBeenCalledWith("u1", "d1", { model: "P1S" });
  });

  it("400 kalau InvalidDeviceModel", async () => {
    loginAs(true);
    (updateDevice as any).mockRejectedValue(new InvalidDeviceModel("x".repeat(12)));
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ model: "x".repeat(12) }) }), ctx("d1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_device_model");
  });
```

Add `InvalidDeviceModel` to the existing import from `"@/lib/devices/errors"`:

```ts
import { DeviceNotFound, InvalidPrinterType, InvalidDeviceModel } from "@/lib/devices/errors";
```

Create `apps/saas/app/api/agent/devices/[shortCode]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ updateDeviceModelByShortCode: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { updateDeviceModelByShortCode } from "@/lib/devices/service";
import { DeviceNotFound, InvalidDeviceModel } from "@/lib/devices/errors";
import { PATCH } from "./route";

beforeEach(() => vi.clearAllMocks());

function ctx(shortCode: string) {
  return { params: Promise.resolve({ shortCode }) };
}

function req(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: { Authorization: "Bearer slz_x" } });
}

describe("PATCH /api/agent/devices/[shortCode]", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await PATCH(req({ model: "P1S" }), ctx("abc1234567"));
    expect(res.status).toBe(401);
    expect(updateDeviceModelByShortCode).not.toHaveBeenCalled();
  });

  it("400 kalau body.model bukan string", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const res = await PATCH(req({ model: 123 }), ctx("abc1234567"));
    expect(res.status).toBe(400);
    expect(updateDeviceModelByShortCode).not.toHaveBeenCalled();
  });

  it("404 kalau shortCode bukan milik user", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (updateDeviceModelByShortCode as any).mockRejectedValue(new DeviceNotFound());
    const res = await PATCH(req({ model: "P1S" }), ctx("abc1234567"));
    expect(res.status).toBe(404);
  });

  it("400 kalau InvalidDeviceModel", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (updateDeviceModelByShortCode as any).mockRejectedValue(new InvalidDeviceModel("x".repeat(12)));
    const res = await PATCH(req({ model: "x".repeat(12) }), ctx("abc1234567"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_device_model");
  });

  it("200 kalau sukses, field selain model diabaikan", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (updateDeviceModelByShortCode as any).mockResolvedValue({ id: "d1", model: "P1S" });
    const res = await PATCH(req({ model: "P1S", label: "harus diabaikan" }), ctx("abc1234567"));
    expect(res.status).toBe(200);
    expect(updateDeviceModelByShortCode).toHaveBeenCalledWith("u1", "abc1234567", "P1S");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas test -- route.test.ts`
Expected: FAIL — `InvalidDeviceModel` not imported/handled in the two existing routes; the new route file doesn't exist yet.

- [ ] **Step 3: Update `apps/saas/app/api/devices/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePaidCore } from "@/lib/session-auth";
import { listDevices, createDevice, getDeviceLimit } from "@/lib/devices/service";
import { SlotLimitExceeded, InvalidPrinterType, InvalidDeviceModel } from "@/lib/devices/errors";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [devices, limit] = await Promise.all([listDevices(userId), getDeviceLimit(userId)]);
  return NextResponse.json({ devices, limit });
}

export async function POST(req: Request) {
  const gate = await requirePaidCore();
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json().catch(() => ({}))) as { label?: unknown; printerType?: unknown; model?: unknown };
  if (typeof body.label !== "string" || !body.label.trim()) {
    return NextResponse.json({ error: "invalid_body", reason: "label wajib diisi" }, { status: 400 });
  }
  if (typeof body.printerType !== "string") {
    return NextResponse.json({ error: "invalid_body", reason: "printerType wajib diisi" }, { status: 400 });
  }

  try {
    const device = await createDevice(gate.userId, {
      label: body.label,
      printerType: body.printerType,
      ...(typeof body.model === "string" && { model: body.model }),
    });
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof SlotLimitExceeded) {
      return NextResponse.json({ error: "slot_limit_exceeded", limit: e.limit }, { status: 409 });
    }
    if (e instanceof InvalidPrinterType) {
      return NextResponse.json({ error: "invalid_printer_type" }, { status: 400 });
    }
    if (e instanceof InvalidDeviceModel) {
      return NextResponse.json({ error: "invalid_device_model" }, { status: 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Update `apps/saas/app/api/devices/[id]/route.ts`**

Change only the `PATCH` function and its imports (leave `DELETE` untouched):

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePaidCore } from "@/lib/session-auth";
import { updateDevice, deleteDevice } from "@/lib/devices/service";
import { DeviceNotFound, InvalidPrinterType, InvalidDeviceModel } from "@/lib/devices/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requirePaidCore();
  if (gate instanceof NextResponse) return gate;
  const userId = gate.userId;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { label?: unknown; printerType?: unknown; model?: unknown };

  try {
    const device = await updateDevice(userId, id, {
      ...(typeof body.label === "string" && { label: body.label }),
      ...(typeof body.printerType === "string" && { printerType: body.printerType }),
      ...(typeof body.model === "string" && { model: body.model }),
    });
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof DeviceNotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof InvalidPrinterType) return NextResponse.json({ error: "invalid_printer_type" }, { status: 400 });
    if (e instanceof InvalidDeviceModel) return NextResponse.json({ error: "invalid_device_model" }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create `apps/saas/app/api/agent/devices/[shortCode]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { updateDeviceModelByShortCode } from "@/lib/devices/service";
import { DeviceNotFound, InvalidDeviceModel } from "@/lib/devices/errors";

type Ctx = { params: Promise<{ shortCode: string }> };

/**
 * PATCH-only, Bearer agent-token — Agent mengusulkan model setelah pairing (lihat
 * apps/agent/src/renderer/screens/PairingScreen.tsx). Sengaja HANYA menerima `model`: Agent
 * tak boleh mengubah label/printerType/kepemilikan device lewat jalur ini.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;
  const { shortCode } = await params;
  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  if (typeof body.model !== "string") {
    return NextResponse.json({ error: "invalid_body", reason: "model wajib diisi" }, { status: 400 });
  }

  try {
    const device = await updateDeviceModelByShortCode(result.userId, shortCode, body.model);
    return NextResponse.json(device);
  } catch (e) {
    if (e instanceof DeviceNotFound) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof InvalidDeviceModel) return NextResponse.json({ error: "invalid_device_model" }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas test`
Expected: PASS (whole `@3pb/saas` suite, including the 3 route test files above)

- [ ] **Step 7: Commit**

```bash
git add apps/saas/app/api/devices/route.ts apps/saas/app/api/devices/route.test.ts \
        "apps/saas/app/api/devices/[id]/route.ts" "apps/saas/app/api/devices/[id]/route.test.ts" \
        apps/saas/app/api/agent/devices/
git commit -m "feat(saas): route model di POST/PATCH device + PATCH /api/agent/devices/[shortCode] baru"
```

---

### Task 4: SaaS UI — model input, suggestions, and "belum diisi" nudge

**Files:**
- Modify: `apps/saas/lib/devices/printer-types.ts`
- Modify: `apps/saas/components/printer/DeviceList.tsx`
- Test: `apps/saas/components/printer/DeviceList.test.tsx`

**Interfaces:**
- Consumes: `PRINTER_TYPES`, `PrinterType` (existing, unchanged).
- Produces: `PRINTER_MODEL_SUGGESTIONS: Record<PrinterType, readonly string[]>` (new export from `printer-types.ts`). `Device` type in `DeviceList.tsx` gains `model: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/saas/components/printer/DeviceList.test.tsx`. First, update the `DEVICE_A` fixture and `mockList` signature at the top of the file:

```ts
const DEVICE_A = { id: "d1", label: "Printer A", printerType: "bambu", model: "P1S" };
```

```ts
function mockList(devices: Array<{ id: string; label: string; printerType: string; model: string | null }>, limit = 3) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ devices, limit }) });
}
```

Then add these `it` blocks inside `describe("DeviceList", ...)`:

```ts
  it("kirim model yang diisi user saat tambah", async () => {
    mockList([], 3);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d2", label: "Printer 1", printerType: "bambu", model: "A1Mini" }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByRole("button", { name: /tambah/i }));

    fireEvent.change(screen.getByLabelText("Model printer"), { target: { value: "A1Mini" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({ label: "Printer 1", printerType: "bambu", model: "A1Mini" });
  });

  it("tampilkan model kalau terisi", async () => {
    mockList([DEVICE_A]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText("P1S")).toBeTruthy());
  });

  it("model null -> tampilkan badge 'Model belum diisi'", async () => {
    mockList([{ ...DEVICE_A, model: null }]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText(/model belum diisi/i)).toBeTruthy());
  });

  it("edit inline model: klik badge -> isi -> Enter -> PATCH { model }", async () => {
    mockList([{ ...DEVICE_A, model: null }]);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...DEVICE_A, model: "X1C" }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText(/model belum diisi/i));

    fireEvent.click(screen.getByRole("button", { name: /isi model printer a/i }));
    const input = screen.getByLabelText("Model printer Printer A") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "X1C" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/devices/d1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ model: "X1C" });
    await waitFor(() => expect(screen.getByText("X1C")).toBeTruthy());
  });
```

`handleAdd` will be changed (Step 4 below) to always include `model` in the POST body, which breaks the EXISTING exact-equality assertion in the pre-existing test `"kirim printerType sesuai pilihan dropdown saat tambah (bukan hardcode bambu)"`. Update that test's assertion (it's the only other place asserting the POST body shape):

```ts
    expect(JSON.parse(init.body)).toEqual({ label: "Printer 1", printerType: "moonraker", model: "" });
```

(replacing its old `expect(JSON.parse(init.body)).toEqual({ label: "Printer 1", printerType: "moonraker" });` line — the `model` field is `""` there because that test never types into the new Model input.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas test -- DeviceList.test.tsx`
Expected: FAIL — no model input/badge exists yet, `Device` type has no `model`, and the updated "kirim printerType..." assertion doesn't match the current `handleAdd` body yet.

- [ ] **Step 3: Add `PRINTER_MODEL_SUGGESTIONS` to `printer-types.ts`**

Append to `apps/saas/lib/devices/printer-types.ts`:

```ts
/** Saran (bukan pembatas) untuk datalist input model di DeviceList -- ejaan kanonik sama
 * dengan services/printer-monitor/config.example.json (mis. "A1Mini", bukan "A1 mini"). */
export const PRINTER_MODEL_SUGGESTIONS: Record<PrinterType, readonly string[]> = {
  bambu: ["X1C", "X1E", "X1", "P1S", "P1P", "A1", "A1Mini", "H2D"],
  moonraker: ["U1", "Voron", "Ender3"],
};
```

- [ ] **Step 4: Update `DeviceList.tsx`**

Change the import line:

```tsx
import { PRINTER_TYPES, PRINTER_TYPE_LABELS, PRINTER_MODEL_SUGGESTIONS, type PrinterType } from "@/lib/devices/printer-types";
```

Change the `Device` type:

```tsx
type Device = { id: string; label: string; printerType: string; model: string | null };
```

Add state (alongside the existing `useState` calls):

```tsx
  const [model, setModel] = useState("");
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState("");
```

Update `handleAdd` to send `model`:

```tsx
  async function handleAdd() {
    setError(null);
    const label = `Printer ${devices.length + 1}`;
    const res = await fetch("/api/devices", {
      method: "POST",
      body: JSON.stringify({ label, printerType, model }),
    });
```

(rest of `handleAdd` unchanged)

Add the model-edit handlers, right after `saveRename`:

```tsx
  function startEditModel(device: Device) {
    setEditingModelId(device.id);
    setDraftModel(device.model ?? "");
  }

  async function saveModel(id: string) {
    const value = draftModel.trim();
    setEditingModelId(null);
    const current = devices.find((d) => d.id === id);
    if (value === (current?.model ?? "")) return; // tak berubah -> jangan buang request
    setError(null);
    const res = await fetch(`/api/devices/${id}`, { method: "PATCH", body: JSON.stringify({ model: value }) });
    if (!res.ok) {
      setError("Gagal mengubah model printer.");
      return;
    }
    const updated = await res.json();
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, model: updated?.model ?? (value || null) } : d)));
  }
```

Add the model input + datalist next to the existing printerType `<select>` in the "add" toolbar (inside the `<div className="flex items-center gap-2">` that already holds the `<select>` and `+ Tambah` button, right after the `</select>` closing tag):

```tsx
          <input
            aria-label="Model printer"
            list="model-suggestions"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model (opsional)"
            className="g-inner text-[12px] px-2 py-1.5 rounded-md w-28"
          />
          <datalist id="model-suggestions">
            {PRINTER_MODEL_SUGGESTIONS[printerType].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
```

Add the model cell to each device row, in the `<li>` (right after the existing `<span className="g-t4 text-[11px]">{d.printerType}</span>`):

```tsx
            {editingModelId === d.id ? (
              <input
                aria-label={`Model printer ${d.label}`}
                autoFocus
                value={draftModel}
                onChange={(e) => setDraftModel(e.target.value)}
                onBlur={() => saveModel(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveModel(d.id);
                  if (e.key === "Escape") setEditingModelId(null);
                }}
                placeholder="mis. P1S"
                className="g-inner text-[11px] px-1 py-0.5 rounded-md w-24"
              />
            ) : d.model ? (
              <button type="button" onClick={() => startEditModel(d)} className="g-t4 text-[11px] underline" aria-label={`Ubah model ${d.label}`}>
                {d.model}
              </button>
            ) : (
              <button type="button" onClick={() => startEditModel(d)} className="text-[11px] text-amber-500 underline" aria-label={`Isi model ${d.label}`}>
                Model belum diisi
              </button>
            )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas test -- DeviceList.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full SaaS suite (regression check for the fixture change)**

Run: `pnpm --filter @3pb/saas test`
Expected: PASS — confirms the `DEVICE_A`/`mockList` signature change didn't break other `DeviceList.test.tsx` cases.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/lib/devices/printer-types.ts apps/saas/components/printer/DeviceList.tsx apps/saas/components/printer/DeviceList.test.tsx
git commit -m "feat(saas): input model + saran datalist + nudge 'belum diisi' di DeviceList"
```

---

### Task 5: Agent — `printer-model.ts` (fallback table, SSDP suggestion, name matching)

**Files:**
- Create: `apps/agent/src/main/printer-model.ts`
- Test: `apps/agent/src/main/printer-model.test.ts`

**Interfaces:**
- Consumes: `SaasDevice` type from `./saas-client` (existing).
- Produces: `CYD_TYPE_FALLBACK: Record<"bambu" | "moonraker", string>`, `suggestModelFromSsdp(devModel: string): string | null`, `matchDeviceByName(devName: string, devices: SaasDevice[]): string | null`.

- [ ] **Step 1: Write the failing test**

Create `apps/agent/src/main/printer-model.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { suggestModelFromSsdp, matchDeviceByName, CYD_TYPE_FALLBACK } from "./printer-model";

describe("CYD_TYPE_FALLBACK", () => {
  it("Bambu Lab & Klipper, dua-duanya masuk batas 11 byte buffer firmware", () => {
    expect(CYD_TYPE_FALLBACK).toEqual({ bambu: "Bambu Lab", moonraker: "Klipper" });
    expect(Buffer.byteLength(CYD_TYPE_FALLBACK.bambu, "utf8")).toBeLessThanOrEqual(11);
    expect(Buffer.byteLength(CYD_TYPE_FALLBACK.moonraker, "utf8")).toBeLessThanOrEqual(11);
  });
});

describe("suggestModelFromSsdp", () => {
  it("kode DevModel dikenal -> model kanonik", () => {
    expect(suggestModelFromSsdp("C12")).toBe("P1S");
    expect(suggestModelFromSsdp("C11")).toBe("P1P");
    expect(suggestModelFromSsdp("N1")).toBe("A1Mini");
    expect(suggestModelFromSsdp("3DPrinter-X1-Carbon")).toBe("X1C");
  });

  it("kode tak dikenal -> null (tak menebak), tapi catat warning berisi nilai mentahnya", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(suggestModelFromSsdp("3DPrinter-Unknown-Future-Model")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("3DPrinter-Unknown-Future-Model"));
    warnSpy.mockRestore();
  });
});

describe("matchDeviceByName", () => {
  const devices = [
    { id: "d1", shortCode: "abc1234567", userId: "u1", label: "Neptune", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
    { id: "d2", shortCode: "def1234567", userId: "u1", label: "Moon", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
  ];

  it("cocok walau beda kapitalisasi/spasi", () => {
    expect(matchDeviceByName("Neptune", devices)).toBe("abc1234567");
    expect(matchDeviceByName("  neptune ", devices)).toBe("abc1234567");
    expect(matchDeviceByName("MOON", devices)).toBe("def1234567");
  });

  it("null kalau tak ada yang mirip", () => {
    expect(matchDeviceByName("Jupiter", devices)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @3pb/agent test -- printer-model.test.ts`
Expected: FAIL — `./printer-model` doesn't exist.

- [ ] **Step 3: Implement `printer-model.ts`**

```ts
import type { SaasDevice } from "./saas-client";

/** Dipakai engine-manager.ts kalau Device.model kosong -- "Bambu Lab"/"Klipper" dua-duanya
 * masuk batas 11 byte buffer firmware char type[12] (LAYOUT_LIMITS.maxPrinterModelLength). */
export const CYD_TYPE_FALLBACK: Record<"bambu" | "moonraker", string> = {
  bambu: "Bambu Lab",
  moonraker: "Klipper",
};

// Kode header `DevModel.bambu.com` dari broadcast SSDP LAN Bambu Lab -> model kanonik (ejaan
// sama dengan services/printer-monitor/config.example.json). Header ini didokumentasikan
// publik oleh integrasi open-source pihak ketiga (mis. Home Assistant Bambu Lab, bambulabs_api).
const SSDP_MODEL_CODES: Record<string, string> = {
  "3DPrinter-X1": "X1",
  "3DPrinter-X1-Carbon": "X1C",
  C11: "P1P",
  C12: "P1S",
  C13: "X1E",
  N1: "A1Mini",
  N2S: "A1",
  O1D: "H2D",
};

/** Kode tak dikenal -> null, BUKAN ditebak -- menormalkan string mentah asal-asalan bisa
 * mengirim nilai seperti "3DPrinter-X" ke layar customer, lebih buruk daripada tak menyarankan
 * apa-apa. Warning supaya tabel ini bisa ditumbuhkan dari data lapangan. */
export function suggestModelFromSsdp(devModel: string): string | null {
  const known = SSDP_MODEL_CODES[devModel];
  if (known) return known;
  console.warn(`[printer-model] kode DevModel Bambu tak dikenal, tak disarankan: ${devModel}`);
  return null;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Cari device SaaS yang label-nya paling mirip nama hasil scan -- REKOMENDASI untuk menandai
 * tombol "Pasangkan ke ..." di PairingScreen, bukan keputusan otomatis; user tetap pilih sendiri. */
export function matchDeviceByName(devName: string, devices: SaasDevice[]): string | null {
  const target = normalizeForMatch(devName);
  const match = devices.find((d) => normalizeForMatch(d.label) === target);
  return match?.shortCode ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @3pb/agent test -- printer-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/printer-model.ts apps/agent/src/main/printer-model.test.ts
git commit -m "feat(agent): printer-model.ts -- fallback type, saran SSDP, pencocokan nama"
```

---

### Task 6: Agent — propagate `model` through the SaaS→Agent data path

**Files:**
- Modify: `apps/agent/src/main/saas-client.ts`
- Modify: `apps/agent/src/main/device-cache.ts`
- Modify: `apps/agent/src/main/engine-manager.ts`
- Modify: `apps/agent/src/main/startup.ts`
- Test: `apps/agent/src/main/engine-manager.test.ts`
- Test: `apps/agent/src/main/startup.test.ts`
- Test: `apps/agent/src/main/device-cache.test.ts`

**Interfaces:**
- Consumes: `CYD_TYPE_FALLBACK` from Task 5 (`./printer-model`).
- Produces: `SaasDevice.model: string | null`, `CachedDevice.model?: string | null`, `PairedDevice.model?: string | null`. `startEngine`'s resulting `DeviceConfig.type` is the device's model (or fallback).

- [ ] **Step 1: Write the failing tests**

Append to `apps/agent/src/main/engine-manager.test.ts`, inside `describe("startEngine", ...)`:

```ts
  it("isi DeviceConfig.type dari PairedDevice.model kalau ada", async () => {
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", model: "P1S", secret: { ip: "1.1.1.1", serial: "S", accessCode: "C" } }];
    const { engine } = await startEngine(paired, 1883);
    expect(engine.snapshot().payload[0].type).toBe("P1S");
  });

  it("model null/kosong/whitespace -> fallback CYD_TYPE_FALLBACK per printerType", async () => {
    const paired = [
      { shortCode: "a", label: "A", printerType: "bambu", model: null, secret: { ip: "1.1.1.1", serial: "S", accessCode: "C" } },
      { shortCode: "b", label: "B", printerType: "bambu", model: "   ", secret: { ip: "1.1.1.2", serial: "S", accessCode: "C" } },
      { shortCode: "c", label: "C", printerType: "moonraker", model: undefined, secret: { ip: "1.1.1.3", serial: "", accessCode: "" } },
    ];
    const { engine } = await startEngine(paired, 1883);
    const byId = Object.fromEntries(engine.snapshot().payload.map((p) => [p.id, p.type]));
    expect(byId.a).toBe("Bambu Lab");
    expect(byId.b).toBe("Bambu Lab");
    expect(byId.c).toBe("Klipper");
  });
```

Append to `apps/agent/src/main/startup.test.ts`, inside `describe("buildPairedDevices", ...)`:

```ts
  it("model ikut mengalir dari fetch fresh SaaS ke PairedDevice", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({
      ok: true,
      data: [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", model: "P1S", createdAt: "x", updatedAt: "y" }],
    });

    const paired = await buildPairedDevices();

    expect(paired).toEqual([{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", model: "P1S", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
    expect(saveDeviceCache).toHaveBeenCalledWith([{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", model: "P1S" }]);
  });
```

Append to `apps/agent/src/main/startup.test.ts`, inside `describe("reconcileDevices", ...)`:

```ts
  it("SaaS unreachable -> model ikut dipetakan dari device-cache (bukan undefined)", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({ ok: false, kind: "network_error" });
    (loadDeviceCache as any).mockResolvedValue([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", model: "P1S" }]);

    const result = await reconcileDevices("slz_ok");

    expect(result.devices).toEqual([
      { id: "abc1234567", shortCode: "abc1234567", userId: "", label: "Printer A (cache)", printerType: "bambu", model: "P1S", createdAt: "", updatedAt: "" },
    ]);
    expect(result.paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", model: "P1S", secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
  });

  it("cache lama tanpa field model (versi Agent sebelum fitur ini) -> tetap terbaca, model undefined bukan crash", async () => {
    (loadCredentials as any).mockResolvedValue({
      agentToken: "slz_ok",
      devices: { abc1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } },
    });
    (fetchDevices as any).mockResolvedValue({ ok: false, kind: "network_error" });
    (loadDeviceCache as any).mockResolvedValue([{ shortCode: "abc1234567", label: "Printer A (cache lama)", printerType: "bambu" }]);

    const result = await reconcileDevices("slz_ok");

    expect(result.paired).toEqual([{ shortCode: "abc1234567", label: "Printer A (cache lama)", printerType: "bambu", model: undefined, secret: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } }]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/agent test -- engine-manager.test.ts startup.test.ts`
Expected: FAIL — types don't have `model` yet, `type` in payload is still the connector kind.

- [ ] **Step 3: Update `saas-client.ts`**

In `apps/agent/src/main/saas-client.ts`, change the `SaasDevice` interface:

```ts
export interface SaasDevice {
  id: string;
  shortCode: string;
  userId: string;
  label: string;
  printerType: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Update `device-cache.ts`**

Change the `CachedDevice` interface:

```ts
export interface CachedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  model?: string | null;
}
```

- [ ] **Step 5: Update `engine-manager.ts`**

Change the imports and `PairedDevice` interface, and the `type` assignment inside the `for` loop:

```ts
import { Engine, BambuMqttConnector, MoonrakerConnector, MqttReporter, HmsLookup } from "@3pb/printer-monitor-core";
import type { DeviceConfig, Connector } from "@3pb/printer-monitor-core";
import type { DeviceSecret } from "./credential-store";
import { hmsTable } from "./hms-table";
import { CYD_TYPE_FALLBACK } from "./printer-model";

export interface PairedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  model?: string | null;
  secret: DeviceSecret;
}
```

```ts
    const device: DeviceConfig = {
      id: p.shortCode, // WAJIB persis shortCode — kunci korelasi ke cell layout (Global Constraints)
      name: p.label,
      type: p.model?.trim() || CYD_TYPE_FALLBACK[p.printerType],
      connector: p.printerType,
      ip: p.secret.ip,
      serial: p.secret.serial || undefined,
      accessCode: p.secret.accessCode || undefined,
    };
```

(Note: `p.printerType` here is already narrowed to `"bambu" | "moonraker"` by the preceding `if` check in the same loop, so `CYD_TYPE_FALLBACK[p.printerType]` type-checks.)

- [ ] **Step 6: Update `startup.ts`**

In `apps/agent/src/main/startup.ts`, update `reconcileDevices`:

```ts
export async function reconcileDevices(token: string): Promise<ReconcileResult> {
  let metadata: CachedDevice[];
  const fetchResult = await fetchDevices(token);
  if (fetchResult.ok) {
    metadata = fetchResult.data.map((d) => ({ shortCode: d.shortCode, label: d.label, printerType: d.printerType, model: d.model }));
    await saveDeviceCache(metadata); // refresh cache tiap kali fresh-fetch sukses
  } else {
    metadata = await loadDeviceCache(); // SaaS unreachable (401/403/network_error semua) -> andalkan cache lokal
  }

  const devices: SaasDevice[] = fetchResult.ok
    ? fetchResult.data
    : metadata.map((m) => ({
        id: m.shortCode,
        shortCode: m.shortCode,
        userId: "",
        label: m.label,
        printerType: m.printerType,
        model: m.model ?? null,
        createdAt: "",
        updatedAt: "",
      }));

  const blob = await loadCredentials();
  const paired: PairedDevice[] = [];
  for (const m of metadata) {
    const secret = blob.devices[m.shortCode];
    if (!secret) continue; // device terdaftar tapi belum di-pairing (belum diisi IP/serial/accessCode)
    paired.push({ shortCode: m.shortCode, label: m.label, printerType: m.printerType, model: m.model, secret });
  }
  return { fetchResult, devices, paired };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @3pb/agent test -- engine-manager.test.ts startup.test.ts device-cache.test.ts`
Expected: PASS

- [ ] **Step 8: Run the full Agent suite (regression check — many existing fixtures omit `model`)**

Run: `pnpm --filter @3pb/agent test`
Expected: PASS — `model` is optional everywhere it's read from existing fixtures, so pre-existing tests that don't set it are unaffected. None of the existing tests in `engine-manager.test.ts` assert on `.type` (they only check `.id`), so no other test files need adjustment.

- [ ] **Step 9: Commit**

```bash
git add apps/agent/src/main/saas-client.ts apps/agent/src/main/device-cache.ts apps/agent/src/main/engine-manager.ts apps/agent/src/main/startup.ts \
        apps/agent/src/main/engine-manager.test.ts apps/agent/src/main/startup.test.ts
git commit -m "fix(agent): payload type = Device.model (fallback Bambu Lab/Klipper), bukan printerType"
```

---

### Task 7: Agent — `patchDeviceModel` in `saas-client.ts`

**Files:**
- Modify: `apps/agent/src/main/saas-client.ts`
- Test: `apps/agent/src/main/saas-client.test.ts`

**Interfaces:**
- Produces: `patchDeviceModel(token: string, shortCode: string, model: string): Promise<FetchResult<{ model: string | null }>>`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/agent/src/main/saas-client.test.ts`:

```ts
describe("patchDeviceModel", () => {
  it("ok:true + data kalau 200", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ model: "P1S" }) });
    const result = await patchDeviceModel("slz_valid", "abc1234567", "P1S");
    expect(result).toEqual({ ok: true, data: { model: "P1S" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.88.113:3300/api/agent/devices/abc1234567",
      expect.objectContaining({
        method: "PATCH",
        headers: { Authorization: "Bearer slz_valid", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "P1S" }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await patchDeviceModel("slz_bad", "abc1234567", "P1S")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await patchDeviceModel("slz_valid", "abc1234567", "P1S")).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await patchDeviceModel("slz_valid", "abc1234567", "P1S")).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:network_error kalau 404 (shortCode tak dikenal SaaS ini)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "not_found" }) });
    expect(await patchDeviceModel("slz_valid", "abc-lain", "P1S")).toEqual({ ok: false, kind: "network_error" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/agent test -- saas-client.test.ts`
Expected: FAIL — `patchDeviceModel` is not exported.

- [ ] **Step 3: Implement `patchDeviceModel`**

Append to `apps/agent/src/main/saas-client.ts`:

```ts
export async function patchDeviceModel(token: string, shortCode: string, model: string): Promise<FetchResult<{ model: string | null }>> {
  try {
    const res = await fetch(`${saasBaseUrl()}/api/agent/devices/${shortCode}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, kind: "invalid_token" };
    if (res.status === 403) return { ok: false, kind: "entitlement_expired" };
    if (!res.ok) return { ok: false, kind: "network_error" };
    return { ok: true, data: (await res.json()) as { model: string | null } };
  } catch {
    return { ok: false, kind: "network_error" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/agent test -- saas-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/main/saas-client.ts apps/agent/src/main/saas-client.test.ts
git commit -m "feat(agent): patchDeviceModel -- Agent bisa usulkan model balik ke SaaS"
```

---

### Task 8: Agent — `agent:update-device-model` IPC channel + preload

**Files:**
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/preload/index.ts`
- Test: `apps/agent/src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `patchDeviceModel` from Task 7.
- Produces: IPC channel `"agent:update-device-model"` (main), `window.agentApi.updateDeviceModel(shortCode: string, model: string): Promise<{ ok: boolean }>` (renderer).

- [ ] **Step 1: Write the failing tests**

Append to `apps/agent/src/main/ipc.test.ts`. First, add `patchDeviceModel` to the existing `vi.mock("./saas-client", ...)`:

```ts
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn().mockResolvedValue({ ok: true, data: [] }), fetchLayout: vi.fn(), patchDeviceModel: vi.fn() }));
```

Add `patchDeviceModel` to the existing import from `"./saas-client"`:

```ts
import { fetchDevices, patchDeviceModel } from "./saas-client";
```

Add a new `describe` block:

```ts
describe("agent:update-device-model", () => {
  it("belum ada token -> {ok:false}, TANPA panggil patchDeviceModel", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(result).toEqual({ ok: false });
    expect(patchDeviceModel).not.toHaveBeenCalled();
  });

  it("ada token -> panggil patchDeviceModel dengan token+shortCode+model, balikin {ok:true} kalau sukses", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (patchDeviceModel as any).mockResolvedValueOnce({ ok: true, data: { model: "P1S" } });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(patchDeviceModel).toHaveBeenCalledWith("slz_ok", "abc1234567", "P1S");
    expect(result).toEqual({ ok: true });
  });

  it("patchDeviceModel gagal (mis. offline) -> {ok:false}, TIDAK throw", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (patchDeviceModel as any).mockResolvedValueOnce({ ok: false, kind: "network_error" });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(result).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/agent test -- ipc.test.ts`
Expected: FAIL — `"agent:update-device-model"` handler not registered.

- [ ] **Step 3: Add the handler in `ipc.ts`**

In `apps/agent/src/main/ipc.ts`, update the import:

```ts
import { fetchDevices, patchDeviceModel, type SaasDevice } from "./saas-client";
```

Add the handler inside `registerIpcHandlers()`, right after the existing `ipcMain.handle("agent:pair-device", ...)` block:

```ts
  /**
   * Dipanggil PairingScreen sesudah pairing tersimpan, kalau user mengisi/mengubah model di
   * form pairing -- best-effort, non-blocking (spec §6): pairing lokal SUDAH selesai terlepas
   * dari hasil ini, jadi kegagalan di sini cuma balikin {ok:false} buat ditampilkan sebagai
   * peringatan ringan, BUKAN reject yang bisa dianggap "pairing gagal".
   */
  ipcMain.handle("agent:update-device-model", async (_event, shortCode: string, model: string): Promise<{ ok: boolean }> => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { ok: false };
    const result = await patchDeviceModel(blob.agentToken, shortCode, model);
    return { ok: result.ok };
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/agent test -- ipc.test.ts`
Expected: PASS

- [ ] **Step 5: Expose it through preload (no dedicated test file — matches existing pattern, `src/preload` has none)**

In `apps/agent/src/preload/index.ts`, add to the `agentApi` object (after `pairDevice`):

```ts
  updateDeviceModel: (shortCode: string, model: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("agent:update-device-model", shortCode, model),
```

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/main/ipc.test.ts apps/agent/src/preload/index.ts
git commit -m "feat(agent): IPC agent:update-device-model + expose window.agentApi.updateDeviceModel"
```

---

### Task 9: Agent — `PairingScreen.tsx` model input, suggestion prefill, non-blocking PATCH

**Files:**
- Modify: `apps/agent/src/renderer/screens/PairingScreen.tsx`
- Test: `apps/agent/src/renderer/screens/PairingScreen.test.tsx`

**Interfaces:**
- Consumes: `suggestModelFromSsdp`, `matchDeviceByName` from Task 5 (`../../main/printer-model`); `window.agentApi.updateDeviceModel` from Task 8.
- Produces: pairing form gains a Model field; `savePairing()` calls `window.agentApi.updateDeviceModel` after a successful `pairDevice` when a model was entered and differs from the device's current SaaS `model`.

- [ ] **Step 1: Write the failing tests**

`SaasDevice.model` becomes a required field in Task 6 (`model: string | null`, not optional — the API always serializes it, even as `null`). This file passes device arrays directly as the typed `devices` prop (`<PairingScreen devices={...} .../>`), so `tsc --noEmit` will fail on every existing literal missing `model` unless all three are updated, not just the top-level one.

Update the `devices` fixture at the top of the file:

```ts
const devices = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" }];
```

Update the OTHER TWO `twoDevices` fixtures further down the file (one inside the "2 device terdaftar: onAllPaired HANYA terpanggil..." test, one inside the "2 device, 1 sudah paired dari launch sebelumnya..." test) — add `model: null` to both entries in both arrays:

```ts
    const twoDevices = [
      { id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
      { id: "d2", shortCode: "def1234567", userId: "u1", label: "Printer B", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
    ];
```

Update the `beforeEach` mock of `window.agentApi` to add `updateDeviceModel`:

```ts
beforeEach(() => {
  (globalThis as any).window.agentApi = {
    scanLan: vi.fn().mockResolvedValue({
      bambu: { ok: true, printers: [{ ip: "192.168.1.5", serial: "SER1", model: "C12", name: "Neptune" }] },
      moonraker: [],
    }),
    pairDevice: vi.fn().mockResolvedValue(undefined),
    updateDeviceModel: vi.fn().mockResolvedValue({ ok: true }),
  };
});
```

Add these new `it` blocks inside `describe("PairingScreen", ...)`:

```ts
  it("field Model ter-prefill dari saran SSDP (C12 -> P1S) saat pairing dari hasil scan", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => screen.getByText(/192\.168\.1\.5/));

    fireEvent.click(screen.getByRole("button", { name: /pasangkan/i }));

    expect((screen.getByLabelText(/^model/i) as HTMLInputElement).value).toBe("P1S");
  });

  it("field Model kosong untuk pairing manual (tak ada hasil scan buat disarankan)", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));

    expect((screen.getByLabelText(/^model/i) as HTMLInputElement).value).toBe("");
  });

  it("simpan pairing dengan model terisi -> panggil updateDeviceModel(shortCode, model) sesudah pairDevice", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/^model/i), { target: { value: "P1P" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect((window as any).agentApi.updateDeviceModel).toHaveBeenCalledWith("abc1234567", "P1P"));
    await waitFor(() => expect(screen.getByText(/terpasang/i)).toBeTruthy());
  });

  it("model kosong -> TIDAK panggil updateDeviceModel", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(screen.getByText(/terpasang/i)).toBeTruthy());
    expect((window as any).agentApi.updateDeviceModel).not.toHaveBeenCalled();
  });

  it("updateDeviceModel gagal -> peringatan non-blocking, pairing TETAP dianggap selesai", async () => {
    (window as any).agentApi.updateDeviceModel.mockResolvedValue({ ok: false });
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/^model/i), { target: { value: "P1P" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(screen.getByText(/model belum tersimpan ke akun/i)).toBeTruthy());
    expect(screen.getByText(/terpasang/i)).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/agent test -- PairingScreen.test.tsx`
Expected: FAIL — no Model field exists yet, `updateDeviceModel` never called.

- [ ] **Step 3: Implement the changes in `PairingScreen.tsx`**

Update the imports:

```tsx
import { useState } from "react";
import type { SaasDevice } from "../../main/saas-client";
import type { DiscoveredBambuPrinter } from "../../main/discovery/bambu-ssdp";
import type { DiscoveredMoonrakerPrinter } from "../../main/discovery/moonraker-mdns";
import { suggestModelFromSsdp } from "../../main/printer-model";
```

Add `model` to `PairingTarget`:

```tsx
interface PairingTarget {
  shortCode: string;
  ip: string;
  serial: string;
  model: string;
  isManual: boolean;
}
```

Add state for the non-blocking warning (alongside the existing `useState` calls):

```tsx
  const [modelWarning, setModelWarning] = useState<string | null>(null);
```

Update `startPairing` to accept and prefill a suggested model:

```tsx
  function startPairing(shortCode: string, ip: string, serial: string, suggestedModel: string) {
    // accessCode SENGAJA tidak pernah di-prefill dari hasil scan (tidak ada di paket SSDP
    // maupun mDNS) — user selalu wajib mengetik manual sesuai desain keamanan spec.
    setPairing({ shortCode, ip, serial, model: suggestedModel, isManual: false });
    setAccessCode("");
  }

  function startManualPairing(shortCode: string) {
    setPairing({ shortCode, ip: "", serial: "", model: "", isManual: true });
    setAccessCode("");
  }
```

Update the Bambu results column's "Pasangkan ke ..." button to pass a suggested model (derived from `p.model`, the raw SSDP code):

```tsx
              {unpairedDevices.map((d) => (
                <button key={d.shortCode} onClick={() => startPairing(d.shortCode, p.ip, p.serial, suggestModelFromSsdp(p.model) ?? "")}>
                  Pasangkan ke {d.label}
                </button>
              ))}
```

Update the Moonraker results column's button (no model suggestion available — mDNS carries no model):

```tsx
                <button key={d.shortCode} onClick={() => startPairing(d.shortCode, p.ip, "", "")}>
                  Pasangkan ke {d.label}
                </button>
```

Update `savePairing`:

```tsx
  async function savePairing() {
    if (!pairing) return;
    setPairError(null);
    setModelWarning(null);
    try {
      await window.agentApi.pairDevice(pairing.shortCode, {
        ip: pairing.ip,
        serial: pairing.serial,
        accessCode,
      });
    } catch (err) {
      // IPC rejection (mis. gagal tulis credential-store) TIDAK boleh diam-diam bikin UI
      // beku — device juga TIDAK ditandai "Terpasang" biar user tahu harus coba lagi.
      console.error("[pairing] gagal simpan pairing", err);
      setPairError("Gagal simpan pairing — coba lagi.");
      return;
    }

    // Model diusulkan balik ke SaaS best-effort SETELAH secret lokal tersimpan -- kegagalan di
    // sini TIDAK membatalkan pairing (secret sudah aman), cuma tampil sebagai peringatan ringan
    // (spec §6). Device di SaaS yang model-nya sudah sama tak perlu di-PATCH ulang.
    const modelTrimmed = pairing.model.trim();
    const currentDevice = devices.find((d) => d.shortCode === pairing.shortCode);
    if (modelTrimmed && modelTrimmed !== (currentDevice?.model ?? "")) {
      const result = await window.agentApi.updateDeviceModel(pairing.shortCode, modelTrimmed);
      if (!result.ok) setModelWarning("Model belum tersimpan ke akun — bisa diisi lewat web.");
    }

    // Hitung set berikutnya di luar functional updater setState — memanggil onAllPaired()
    // (yang men-trigger setState di App, komponen LAIN) dari dalam updater React bisa terjadi
    // saat React sedang render, dan React larang "setState komponen lain saat render komponen
    // ini" (warning). Menghitung `next` di sini (closure biasa, bukan updater) lalu memanggil
    // onAllPaired() sebagai efek samping event handler biasa itu aman.
    const next = new Set(pairedCodes);
    next.add(pairing.shortCode);
    setPairing(null);
    setAccessCode("");
    setPairedCodes(next);
    // onAllPaired() hanya dipanggil kalau SEMUA device di prop `devices` sudah ada di `next`
    // — dengan 1 device (kasus test lama) ini selalu true setelah pairing pertama, jadi
    // perilaku lama tetap sama.
    if (devices.every((d) => next.has(d.shortCode))) onAllPaired();
  }
```

Add the Model field to the pairing form. It must apply to BOTH manual and scan-derived pairing, so add it OUTSIDE the `pairing.isManual && (...)` block — right before the Access Code label:

```tsx
          <label htmlFor="model">Model</label>
          <input
            id="model"
            value={pairing.model}
            onChange={(e) => setPairing({ ...pairing, model: e.target.value })}
            placeholder="mis. P1S"
          />
          <label htmlFor="access-code">Access Code</label>
```

(This replaces the existing standalone `<label htmlFor="access-code">Access Code</label>` line — the surrounding `<input id="access-code" .../>` and `<button>`/`{pairError && ...}` below are unchanged.)

Add the non-blocking warning display, right after the `{pairError && <p role="alert">{pairError}</p>}` line:

```tsx
          {modelWarning && <p>{modelWarning}</p>}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/agent test -- PairingScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full Agent suite (regression check for the fixture/type changes)**

Run: `pnpm --filter @3pb/agent test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/renderer/screens/PairingScreen.tsx apps/agent/src/renderer/screens/PairingScreen.test.tsx
git commit -m "feat(agent): PairingScreen -- field Model, saran dari SSDP, PATCH balik non-blocking"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run the full monorepo test suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm turbo test`
Expected: PASS across all packages (`@3pb/cyd-layout-schema`, `@3pb/saas`, `@3pb/agent`, and unrelated packages untouched by this plan).

- [ ] **Step 2: Run typecheck on the two touched apps**

Run: `pnpm --filter @3pb/saas typecheck`
Expected: PASS — confirms `@prisma/client`'s regenerated types (Task 2, Step 2) satisfy every `model` usage across `service.ts` and the route handlers.

Run: `pnpm --filter @3pb/agent exec tsc --noEmit` (`apps/agent/package.json` has no dedicated `typecheck` script, so invoke `tsc` directly against its `tsconfig.json`)
Expected: PASS.

- [ ] **Step 3: Re-check spec coverage manually**

Confirm each spec section has a corresponding change:
- §1–2 (buffer limit): Task 1, Task 2.
- §3 (data flow): Tasks 2, 3, 6.
- §4 (SaaS validation/routes/UI): Tasks 2, 3, 4.
- §5 (Agent payload jalur): Task 6.
- §6 (SSDP suggestion + PairingScreen PATCH): Tasks 5, 7, 8, 9.
- §7 (no backfill, nudge): Task 4.
- §8 (compat): verified by fallback logic in Task 6 and optional fields throughout.

- [ ] **Step 4: Confirm no `packages/printer-monitor-core` files were touched**

Run: `git diff --stat master... -- packages/printer-monitor-core`
Expected: empty output (no changes) — this package must remain untouched per the Global Constraints.
