# Agent File Manager + Print-from-SD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah file management (browse/upload/download/delete/rename) ke storage SD card printer Bambu dari `apps/agent`, plus trigger print langsung dari file yang dipilih (dengan plate picker), termasuk shortcut drag-and-drop di halaman device.

**Architecture:** Modul baru `apps/agent/src/main/file-manager/` menampung `BambuFtpsClient` (implementasi `PrinterFileClient` generik via `basic-ftp`, connect-per-operation) dan `threemf-parser.ts` (parse metadata plate/AMS dari `.gcode.3mf` pakai `jszip` + `fast-xml-parser`). File CRUD diekspos lewat handler IPC baru (`agent:file-*`). Print-trigger **tidak** buat channel IPC baru — diperluas dari union `PrinterCommand` yang sudah ada di `packages/printer-monitor-core`, sehingga jalur `agent:printer-command` (`sendPrinterCommand`) yang sudah dipakai `PrinterControls.tsx` langsung bisa dipakai ulang untuk kirim command `startPrint`. Renderer dapat 3 komponen baru: `FileManagerPanel.tsx` (grid card + multi-select bulk download/delete), `PrintStartDialog.tsx` (plate picker 2-step + konfirmasi), `FileDropOverlay.tsx` (drag-drop shortcut di `DashboardScreen.tsx`).

**Tech Stack:** Electron (main + renderer React), TypeScript, `basic-ftp` (FTPS client, baru), `jszip` + `fast-xml-parser` (parse 3mf, baru), `vitest` + `@testing-library/react` (sudah ada), `mqtt` (sudah ada, dipakai `BambuMqttConnector`).

**Spec:** [docs/superpowers/specs/2026-08-20-agent-file-manager-print-design.md](../specs/2026-08-20-agent-file-manager-print-design.md)

## Global Constraints

- Bambu (FTPS) dulu — Moonraker/REST ditunda ke fase berikutnya, tapi `PrinterFileClient` interface harus tetap generik (tidak Bambu-spesifik di level type).
- Connect-per-operation untuk FTPS — tidak ada koneksi persisten yang di-reuse lintas request.
- Tanpa retry otomatis di mana pun — kegagalan langsung dilaporkan ke renderer, user retry manual.
- Limit ukuran upload: soft warning >500MB, hard block ≥4GB (limit FAT32) — divalidasi di renderer sebelum IPC dipanggil.
- Kredensial device diambil dari `credential-store.ts` yang sudah ada (`loadCredentials()` → `blob.devices[shortCode]`) — tidak ada re-auth terpisah.
- AMS mapping di `PrintStartDialog` **read-only, teks-only** di v1 — TIDAK ada UI untuk override AMS, dan TIDAK ada payload MQTT untuk override AMS (belum diriset, out of scope).
- Print-start selalu 2 langkah: pilih plate → dialog konfirmasi final terpisah dengan warning eksplisit — tidak boleh digabung jadi satu langkah.
- Konvensi channel IPC di repo ini adalah `agent:<verb-kebab>` (bukan `file:<verb>` seperti di draft awal spec) — ikuti konvensi nyata `ipc.ts`/`preload/index.ts`.
- Konvensi test: `vitest`, mock total untuk I/O eksternal (`vi.mock("basic-ftp")`, `vi.mock("node:fs")`, dst) — tidak ada test yang menyentuh network/printer fisik sungguhan.

---

## Peta file

```
apps/agent/src/main/file-manager/
  types.ts                    # PrinterFileEntry, PrinterFileClient (baru)
  bambu-ftps-client.ts        # implementasi FTPS Bambu (baru)
  bambu-ftps-client.test.ts   # (baru)
  threemf-parser.ts           # parse plate/filament dari .gcode.3mf (baru)
  threemf-parser.test.ts      # (baru)

apps/agent/src/main/ipc.ts    # tambah handler agent:file-* (modify)
apps/agent/src/preload/index.ts  # tambah method agentApi.file* (modify)
packages/printer-monitor-core/src/types.ts               # extend PrinterCommand (modify)
packages/printer-monitor-core/src/connectors/bambu-mqtt.ts  # implement startPrint (modify)
packages/printer-monitor-core/src/connectors/bambu-mqtt.test.ts  # (modify, kalau ada — cek dulu)

apps/agent/src/renderer/components/
  FileManagerPanel.tsx        # (baru)
  FileManagerPanel.test.tsx   # (baru)
  PrintStartDialog.tsx        # (baru)
  PrintStartDialog.test.tsx   # (baru)
  FileDropOverlay.tsx         # (baru)
  FileDropOverlay.test.tsx    # (baru)
apps/agent/src/renderer/screens/DashboardScreen.tsx  # wire FileDropOverlay + tab Files (modify)
```

---

### Task 1: `PrinterFileClient` interface + `BambuFtpsClient`

**Files:**
- Create: `apps/agent/src/main/file-manager/types.ts`
- Create: `apps/agent/src/main/file-manager/bambu-ftps-client.ts`
- Test: `apps/agent/src/main/file-manager/bambu-ftps-client.test.ts`
- Modify: `apps/agent/package.json` (tambah dependency `basic-ftp`)

**Interfaces:**
- Produces: `PrinterFileEntry { name: string; path: string; size: number; isDirectory: boolean; modifiedAt: string }`, `PrinterFileClient { list(path): Promise<PrinterFileEntry[]>; upload(localPath, remotePath): Promise<void>; download(remotePath, localPath): Promise<void>; delete(remotePath): Promise<void>; rename(oldPath, newPath): Promise<void> }`, class `BambuFtpsClient` yang implement `PrinterFileClient`, constructor `(ip: string, accessCode: string)`.

- [ ] **Step 1: Tambah dependency**

```bash
cd apps/agent && pnpm add basic-ftp
```

- [ ] **Step 2: Tulis `types.ts`**

```ts
// apps/agent/src/main/file-manager/types.ts
export interface PrinterFileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

export interface PrinterFileClient {
  list(path: string): Promise<PrinterFileEntry[]>;
  upload(localPath: string, remotePath: string): Promise<void>;
  download(remotePath: string, localPath: string): Promise<void>;
  delete(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}
```

- [ ] **Step 3: Tulis test yang gagal dulu untuk `BambuFtpsClient.list`**

```ts
// apps/agent/src/main/file-manager/bambu-ftps-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAccess = vi.fn();
const mockList = vi.fn();
const mockUploadFrom = vi.fn();
const mockDownloadTo = vi.fn();
const mockRemove = vi.fn();
const mockRename = vi.fn();
const mockClose = vi.fn();

vi.mock("basic-ftp", () => ({
  Client: vi.fn().mockImplementation(() => ({
    access: mockAccess,
    list: mockList,
    uploadFrom: mockUploadFrom,
    downloadTo: mockDownloadTo,
    remove: mockRemove,
    rename: mockRename,
    close: mockClose,
  })),
}));

import { BambuFtpsClient } from "./bambu-ftps-client";

describe("BambuFtpsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connect pakai implicit TLS port 990 dan user bblp", async () => {
    mockList.mockResolvedValue([]);
    const client = new BambuFtpsClient("192.168.1.50", "12345678");

    await client.list("/");

    expect(mockAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "192.168.1.50",
        port: 990,
        user: "bblp",
        password: "12345678",
        secure: "implicit",
      }),
    );
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("balikin daftar file dari list FTP, map ke PrinterFileEntry", async () => {
    mockList.mockResolvedValue([
      { name: "test.gcode", size: 340000, isDirectory: false, modifiedAt: new Date("2026-08-01T00:00:00Z") },
      { name: "cache", size: 0, isDirectory: true, modifiedAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    const client = new BambuFtpsClient("192.168.1.50", "12345678");

    const entries = await client.list("/");

    expect(entries).toEqual([
      { name: "test.gcode", path: "/test.gcode", size: 340000, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
      { name: "cache", path: "/cache", size: 0, isDirectory: true, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("upload panggil uploadFrom lalu tutup koneksi", async () => {
    const client = new BambuFtpsClient("192.168.1.50", "12345678");
    await client.upload("/tmp/local.gcode", "/remote.gcode");
    expect(mockUploadFrom).toHaveBeenCalledWith("/tmp/local.gcode", "/remote.gcode");
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("tetap tutup koneksi walau operasi gagal", async () => {
    mockList.mockRejectedValue(new Error("connection timeout"));
    const client = new BambuFtpsClient("192.168.1.50", "12345678");

    await expect(client.list("/")).rejects.toThrow("connection timeout");
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/file-manager/bambu-ftps-client.test.ts`
Expected: FAIL — `bambu-ftps-client.ts` belum ada.

- [ ] **Step 5: Implementasi `bambu-ftps-client.ts`**

Bambu FTPS pakai username tetap `"bblp"`, password = access code, port 990, TLS implicit, dan sertifikat self-signed (`rejectUnauthorized: false` wajib, kalau tidak koneksi selalu gagal verifikasi cert).

```ts
// apps/agent/src/main/file-manager/bambu-ftps-client.ts
import { Client, type FileInfo } from "basic-ftp";
import type { PrinterFileClient, PrinterFileEntry } from "./types";

const BAMBU_FTPS_USER = "bblp";
const BAMBU_FTPS_PORT = 990;

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

function toEntry(dir: string, info: FileInfo): PrinterFileEntry {
  return {
    name: info.name,
    path: joinPath(dir, info.name),
    size: info.size,
    isDirectory: info.isDirectory,
    modifiedAt: new Date(info.modifiedAt ?? Date.now()).toISOString(),
  };
}

export class BambuFtpsClient implements PrinterFileClient {
  constructor(
    private readonly ip: string,
    private readonly accessCode: string,
  ) {}

  private async withConnection<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client();
    try {
      await client.access({
        host: this.ip,
        port: BAMBU_FTPS_PORT,
        user: BAMBU_FTPS_USER,
        password: this.accessCode,
        secure: "implicit",
        secureOptions: { rejectUnauthorized: false },
      });
      return await fn(client);
    } finally {
      client.close();
    }
  }

  async list(path: string): Promise<PrinterFileEntry[]> {
    return this.withConnection(async (client) => {
      const raw = await client.list(path);
      return raw.map((info) => toEntry(path, info));
    });
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    await this.withConnection((client) => client.uploadFrom(localPath, remotePath));
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.withConnection((client) => client.downloadTo(localPath, remotePath));
  }

  async delete(remotePath: string): Promise<void> {
    await this.withConnection((client) => client.remove(remotePath));
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.withConnection((client) => client.rename(oldPath, newPath));
  }
}
```

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/main/file-manager/bambu-ftps-client.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/package.json apps/agent/pnpm-lock.yaml apps/agent/src/main/file-manager/types.ts apps/agent/src/main/file-manager/bambu-ftps-client.ts apps/agent/src/main/file-manager/bambu-ftps-client.test.ts
git commit -m "feat(agent): add BambuFtpsClient for SD card file operations"
```

---

### Task 2: IPC + preload untuk file CRUD

**Files:**
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/preload/index.ts`
- Test: `apps/agent/src/main/ipc.test.ts` (kalau belum ada test file untuk `ipc.ts`, buat baru; kalau sudah ada, tambah `describe` baru di file yang sama — cek dulu dengan `ls apps/agent/src/main/ipc.test.ts`)

**Interfaces:**
- Consumes: `BambuFtpsClient` dari Task 1 (`apps/agent/src/main/file-manager/bambu-ftps-client.ts`), `loadCredentials()` dari `apps/agent/src/main/credential-store.ts` (return `Promise<CredentialBlob>`, `blob.devices[shortCode]: DeviceSecret`, `DeviceSecret { ip, serial, accessCode }`).
- Produces: channel IPC `agent:file-list(shortCode, path)`, `agent:file-upload(shortCode, localPath, remotePath)`, `agent:file-download(shortCode, remotePath, localPath)`, `agent:file-delete(shortCode, remotePath)`, `agent:file-rename(shortCode, oldPath, newPath)`. Method preload `window.agentApi.listFiles`, `uploadFile`, `downloadFile`, `deleteFile`, `renameFile` — dipakai Task 6 (`FileManagerPanel.tsx`).

- [ ] **Step 1: Cek pola handler yang sudah ada + mock existing di test**

Baca `apps/agent/src/main/ipc.ts` sekitar baris 44-48 dan 159-163 untuk konfirmasi pola `ipcMain.handle("agent:<verb>", async (_event, ...args): Promise<T> => {...})` masih sama sebelum menambah handler baru. **Baca juga `apps/agent/src/main/ipc.test.ts` secara keseluruhan** — file ini sudah ada (±21KB) dan sudah punya `vi.mock("electron", ...)` serta `vi.mock("node:fs", ...)` sendiri. Snippet Step 2 di bawah **harus digabung ke struktur mock yang sudah ada** (tambahkan channel baru ke Map handler yang sama, jangan buat `vi.mock` duplikat untuk modul yang sama di file yang sama — vitest akan pakai mock terakhir dan berpotensi override punya test lain).

- [ ] **Step 2: Tulis test yang gagal untuk handler `agent:file-list`**

```ts
// apps/agent/src/main/ipc.test.ts (tambahkan describe baru di file test ipc.ts yang sudah ada, atau buat baru kalau belum ada)
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockList = vi.fn();
vi.mock("./file-manager/bambu-ftps-client", () => ({
  BambuFtpsClient: vi.fn().mockImplementation(() => ({ list: mockList })),
}));

const mockLoadCredentials = vi.fn();
vi.mock("./credential-store", () => ({
  loadCredentials: mockLoadCredentials,
}));

vi.mock("electron", () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
    },
    __handlers: handlers,
  };
});

describe("agent:file-list handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ambil kredensial device lalu list file via BambuFtpsClient", async () => {
    mockLoadCredentials.mockResolvedValue({
      agentToken: "t",
      devices: { ABC123: { ip: "192.168.1.50", serial: "S1", accessCode: "999" } },
    });
    mockList.mockResolvedValue([{ name: "a.gcode", path: "/a.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" }]);

    const { registerIpcHandlers } = await import("./ipc");
    const electron = await import("electron");
    registerIpcHandlers();
    const handler = (electron as unknown as { __handlers: Map<string, (...a: unknown[]) => unknown> }).__handlers.get("agent:file-list");

    const result = await handler?.(undefined, "ABC123", "/");

    expect(mockList).toHaveBeenCalledWith("/");
    expect(result).toEqual([{ name: "a.gcode", path: "/a.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" }]);
  });

  it("balikin error terstruktur kalau device tidak ditemukan di credential store", async () => {
    mockLoadCredentials.mockResolvedValue({ agentToken: "t", devices: {} });

    const { registerIpcHandlers } = await import("./ipc");
    const electron = await import("electron");
    registerIpcHandlers();
    const handler = (electron as unknown as { __handlers: Map<string, (...a: unknown[]) => unknown> }).__handlers.get("agent:file-list");

    await expect(handler?.(undefined, "UNKNOWN", "/")).rejects.toThrow("device_not_found");
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts -t "agent:file-list"`
Expected: FAIL — handler `agent:file-list` belum terdaftar.

- [ ] **Step 4: Tambah handler di `ipc.ts`**

Tambahkan di dalam `registerIpcHandlers()`, dekat handler `agent:*` lain:

```ts
// apps/agent/src/main/ipc.ts — tambahkan import di atas file
import { BambuFtpsClient } from "./file-manager/bambu-ftps-client";
import type { PrinterFileEntry } from "./file-manager/types";

// tambahkan di dalam registerIpcHandlers()
async function getFileClientFor(shortCode: string): Promise<BambuFtpsClient> {
  const blob = await loadCredentials();
  const secret = blob.devices[shortCode];
  if (!secret) throw new Error("device_not_found");
  return new BambuFtpsClient(secret.ip, secret.accessCode);
}

ipcMain.handle("agent:file-list", async (_event, shortCode: string, path: string): Promise<PrinterFileEntry[]> => {
  const client = await getFileClientFor(shortCode);
  return client.list(path);
});

ipcMain.handle("agent:file-upload", async (_event, shortCode: string, localPath: string, remotePath: string): Promise<void> => {
  const client = await getFileClientFor(shortCode);
  await client.upload(localPath, remotePath);
});

ipcMain.handle("agent:file-download", async (_event, shortCode: string, remotePath: string, localPath: string): Promise<void> => {
  const client = await getFileClientFor(shortCode);
  await client.download(remotePath, localPath);
});

ipcMain.handle("agent:file-delete", async (_event, shortCode: string, remotePath: string): Promise<void> => {
  const client = await getFileClientFor(shortCode);
  await client.delete(remotePath);
});

ipcMain.handle("agent:file-rename", async (_event, shortCode: string, oldPath: string, newPath: string): Promise<void> => {
  const client = await getFileClientFor(shortCode);
  await client.rename(oldPath, newPath);
});
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts -t "agent:file-list"`
Expected: PASS, 2 test.

- [ ] **Step 6: Tambah method preload**

```ts
// apps/agent/src/preload/index.ts — tambahkan ke object agentApi
listFiles: (shortCode: string, path: string): Promise<PrinterFileEntry[]> =>
  ipcRenderer.invoke("agent:file-list", shortCode, path),
uploadFile: (shortCode: string, localPath: string, remotePath: string): Promise<void> =>
  ipcRenderer.invoke("agent:file-upload", shortCode, localPath, remotePath),
downloadFile: (shortCode: string, remotePath: string, localPath: string): Promise<void> =>
  ipcRenderer.invoke("agent:file-download", shortCode, remotePath, localPath),
deleteFile: (shortCode: string, remotePath: string): Promise<void> =>
  ipcRenderer.invoke("agent:file-delete", shortCode, remotePath),
renameFile: (shortCode: string, oldPath: string, newPath: string): Promise<void> =>
  ipcRenderer.invoke("agent:file-rename", shortCode, oldPath, newPath),
```

Tambahkan juga import type `PrinterFileEntry` dari `"../main/file-manager/types"` di bagian atas file.

- [ ] **Step 7: Build TypeScript untuk cek tipe cocok**

Run: `cd apps/agent && npx tsc --noEmit`
Expected: tidak ada error tipe baru.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/preload/index.ts apps/agent/src/main/ipc.test.ts
git commit -m "feat(agent): expose file CRUD over IPC (list/upload/download/delete/rename)"
```

---

### Task 3: `threemf-parser.ts` — parse plate & filament map

**Files:**
- Create: `apps/agent/src/main/file-manager/threemf-parser.ts`
- Test: `apps/agent/src/main/file-manager/threemf-parser.test.ts`
- Modify: `apps/agent/package.json` (tambah dependency `jszip`, `fast-xml-parser`)

**Interfaces:**
- Produces: `PlateFilament { id: number; color: string; type: string; amsSlot: number }`, `PlateInfo { index: number; filaments: PlateFilament[] }`, `parseThreemf(buffer: Buffer): Promise<PlateInfo[]>` — dipakai Task 4 (`agent:file-parse-3mf`).

**Catatan penting:** format XML `Metadata/slice_info.config` di bawah ini disusun berdasarkan riset di vault OK (`3dprintingbandung/integrations/bambu-3mf-gcode-metadata`), yang mengonfirmasi elemen `<plate>` berisi `<filament id=".." color=".." type=".."/>` dan `<metadata key="filament_maps" value="1 1"/>`, tapi **tidak menyebutkan key eksplisit untuk nomor urut plate**. Parser di bawah pakai fallback: index plate = posisi array (1-based) kalau tidak ketemu `<metadata key="index" value="N"/>`. **Wajib diverifikasi manual terhadap file `.gcode.3mf` asli sebelum fitur ini dianggap selesai** (lihat Task 3 Step 7).

- [ ] **Step 1: Tambah dependency**

```bash
cd apps/agent && pnpm add jszip fast-xml-parser
```

- [ ] **Step 2: Tulis test yang gagal, dengan fixture 3mf sintetis (dibangun di dalam test, bukan file customer asli)**

```ts
// apps/agent/src/main/file-manager/threemf-parser.test.ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseThreemf } from "./threemf-parser";

async function buildFixture(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "Metadata/slice_info.config",
    `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <filament id="1" color="#FEFEFE" type="PLA"/>
    <filament id="2" color="#000000" type="PLA"/>
    <metadata key="filament_maps" value="1 1"/>
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <filament id="1" color="#FF0000" type="PETG"/>
    <metadata key="filament_maps" value="2"/>
  </plate>
</config>`,
  );
  const content = await zip.generateAsync({ type: "nodebuffer" });
  return content;
}

describe("parseThreemf", () => {
  it("parse daftar plate dengan filament dan AMS slot dari filament_maps", async () => {
    const buffer = await buildFixture();

    const plates = await parseThreemf(buffer);

    expect(plates).toEqual([
      {
        index: 1,
        filaments: [
          { id: 1, color: "#FEFEFE", type: "PLA", amsSlot: 1 },
          { id: 2, color: "#000000", type: "PLA", amsSlot: 1 },
        ],
      },
      {
        index: 2,
        filaments: [{ id: 1, color: "#FF0000", type: "PETG", amsSlot: 2 }],
      },
    ]);
  });

  it("throw error jelas kalau Metadata/slice_info.config tidak ada (bukan format Bambu)", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "bukan file bambu");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parseThreemf(buffer)).rejects.toThrow("not_bambu_3mf");
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/file-manager/threemf-parser.test.ts`
Expected: FAIL — `threemf-parser.ts` belum ada.

- [ ] **Step 4: Implementasi `threemf-parser.ts`**

```ts
// apps/agent/src/main/file-manager/threemf-parser.ts
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export interface PlateFilament {
  id: number;
  color: string;
  type: string;
  amsSlot: number;
}

export interface PlateInfo {
  index: number;
  filaments: PlateFilament[];
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

interface RawFilament {
  id: string;
  color: string;
  type: string;
}

interface RawMetadata {
  key: string;
  value: string;
}

interface RawPlate {
  metadata?: RawMetadata | RawMetadata[];
  filament?: RawFilament | RawFilament[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePlate(raw: RawPlate, fallbackIndex: number): PlateInfo {
  const metadata = toArray(raw.metadata);
  const indexMeta = metadata.find((m) => m.key === "index");
  const index = indexMeta ? Number(indexMeta.value) : fallbackIndex;

  const filamentMapsMeta = metadata.find((m) => m.key === "filament_maps");
  const amsSlots = filamentMapsMeta ? filamentMapsMeta.value.trim().split(/\s+/).map(Number) : [];

  const filaments = toArray(raw.filament).map((f, i) => ({
    id: Number(f.id),
    color: f.color,
    type: f.type,
    amsSlot: amsSlots[i] ?? 1,
  }));

  return { index, filaments };
}

export async function parseThreemf(buffer: Buffer): Promise<PlateInfo[]> {
  const zip = await JSZip.loadAsync(buffer);
  const sliceInfoFile = zip.file("Metadata/slice_info.config");
  if (!sliceInfoFile) {
    throw new Error("not_bambu_3mf");
  }

  const xml = await sliceInfoFile.async("string");
  const parsed = xmlParser.parse(xml) as { config?: { plate?: RawPlate | RawPlate[] } };
  const rawPlates = toArray(parsed.config?.plate);

  return rawPlates.map((raw, i) => parsePlate(raw, i + 1));
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/main/file-manager/threemf-parser.test.ts`
Expected: PASS, 2 test.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/package.json apps/agent/pnpm-lock.yaml apps/agent/src/main/file-manager/threemf-parser.ts apps/agent/src/main/file-manager/threemf-parser.test.ts
git commit -m "feat(agent): parse plate/filament metadata from Bambu .gcode.3mf files"
```

- [ ] **Step 7: Verifikasi manual (WAJIB sebelum fitur dianggap selesai, catat di PR description)**

Ambil satu file `.gcode.3mf` asli (contoh: `custom nama/minecraft_name_Custom_020825_1 - peak green.gcode.3mf` di `/Users/adhityatangahu/Documents/custom nama/`), jalankan `parseThreemf` terhadap isinya lewat skrip Node sekali-pakai, bandingkan hasil `index`/`amsSlot` dengan yang ditampilkan Bambu Studio/Handy untuk file yang sama. Kalau key `index` di `<metadata>` ternyata bernama lain, update `parsePlate()` sesuai temuan nyata sebelum lanjut ke Task 4.

---

### Task 4: IPC `agent:file-parse-3mf` (download ke temp + parse)

**Files:**
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/preload/index.ts`
- Test: `apps/agent/src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `BambuFtpsClient.download` (Task 1), `parseThreemf` (Task 3).
- Produces: channel `agent:file-parse-3mf(shortCode, remotePath)` → `Promise<PlateInfo[]>`, preload `window.agentApi.parseThreemf(shortCode, remotePath): Promise<PlateInfo[]>` — dipakai Task 7 (`PrintStartDialog.tsx`) dan Task 8 (`FileDropOverlay.tsx`).

- [ ] **Step 1: Tulis test yang gagal**

```ts
// tambahkan ke apps/agent/src/main/ipc.test.ts
const mockDownload = vi.fn();
const mockParseThreemf = vi.fn();
vi.mock("./file-manager/bambu-ftps-client", () => ({
  BambuFtpsClient: vi.fn().mockImplementation(() => ({ download: mockDownload })),
}));
vi.mock("./file-manager/threemf-parser", () => ({
  parseThreemf: mockParseThreemf,
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake")),
  rm: vi.fn().mockResolvedValue(undefined),
}));

describe("agent:file-parse-3mf handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("download file ke temp, parse, lalu hapus file temp", async () => {
    mockLoadCredentials.mockResolvedValue({
      agentToken: "t",
      devices: { ABC123: { ip: "192.168.1.50", serial: "S1", accessCode: "999" } },
    });
    mockParseThreemf.mockResolvedValue([{ index: 1, filaments: [] }]);

    const { registerIpcHandlers } = await import("./ipc");
    const electron = await import("electron");
    registerIpcHandlers();
    const handler = (electron as unknown as { __handlers: Map<string, (...a: unknown[]) => unknown> }).__handlers.get("agent:file-parse-3mf");

    const result = await handler?.(undefined, "ABC123", "/model.gcode.3mf");

    expect(mockDownload).toHaveBeenCalledWith("/model.gcode.3mf", expect.stringContaining("model.gcode.3mf"));
    expect(result).toEqual([{ index: 1, filaments: [] }]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts -t "agent:file-parse-3mf"`
Expected: FAIL.

- [ ] **Step 3: Tambah handler**

```ts
// apps/agent/src/main/ipc.ts — tambah import
import { parseThreemf, type PlateInfo } from "./file-manager/threemf-parser";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

ipcMain.handle("agent:file-parse-3mf", async (_event, shortCode: string, remotePath: string): Promise<PlateInfo[]> => {
  const client = await getFileClientFor(shortCode);
  const fileName = remotePath.split("/").pop() ?? "download.gcode.3mf";
  const tempPath = join(tmpdir(), `agent-3mf-${Date.now()}-${fileName}`);
  try {
    await client.download(remotePath, tempPath);
    const buffer = await readFile(tempPath);
    return await parseThreemf(buffer);
  } finally {
    await rm(tempPath, { force: true });
  }
});
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/main/ipc.test.ts -t "agent:file-parse-3mf"`
Expected: PASS.

- [ ] **Step 5: Tambah preload method**

```ts
// apps/agent/src/preload/index.ts
parseThreemf: (shortCode: string, remotePath: string): Promise<PlateInfo[]> =>
  ipcRenderer.invoke("agent:file-parse-3mf", shortCode, remotePath),
```

Import type `PlateInfo` dari `"../main/file-manager/threemf-parser"`.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/preload/index.ts apps/agent/src/main/ipc.test.ts
git commit -m "feat(agent): add IPC handler to download + parse .gcode.3mf plate metadata"
```

---

### Task 5: Extend `PrinterCommand` dengan `startPrint`, implementasi di `BambuMqttConnector`

**Files:**
- Modify: `packages/printer-monitor-core/src/types.ts`
- Modify: `packages/printer-monitor-core/src/connectors/bambu-mqtt.ts`
- Test: `packages/printer-monitor-core/src/connectors/bambu-mqtt.test.ts` (cek dulu apakah file ini sudah ada dengan `ls packages/printer-monitor-core/src/connectors/*.test.ts`; kalau belum ada, buat baru mengikuti pola test connector lain di direktori yang sama)

**Interfaces:**
- Consumes: union `PrinterCommand` yang sudah ada (baca `packages/printer-monitor-core/src/types.ts` sekitar baris 3-8 dulu untuk konfirmasi bentuk literal union sebelum diedit — laporan eksplorasi menyebut bentuknya `{kind:'pause'} | {kind:'resume'} | {kind:'stop'} | {kind:'setSpeedLevel'; level:number} | {kind:'setSpeedPercent'; percent:number}`, tapi verifikasi ke file asli dulu sebelum menambah varian).
- Produces: varian baru `{ kind: 'startPrint'; filename: string; plateIndex: number }` ditambahkan ke union — dipakai Task 7 lewat `window.agentApi.sendPrinterCommand(deviceId, cmd)` yang **sudah ada** (tidak perlu channel IPC baru).

- [ ] **Step 1: Baca file asli untuk konfirmasi bentuk union**

Run: `sed -n '1,20p' packages/printer-monitor-core/src/types.ts`

Kalau bentuknya beda dari yang diasumsikan di atas, sesuaikan Step 2 & 3 di bawah supaya konsisten (tetap tambahkan field `kind: 'startPrint'` dengan `filename: string; plateIndex: number`, hanya syntax union-nya yang menyesuaikan).

- [ ] **Step 2: Tambah varian ke union `PrinterCommand`**

```ts
// packages/printer-monitor-core/src/types.ts — tambahkan satu baris union baru
export type PrinterCommand =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'stop' }
  | { kind: 'setSpeedLevel'; level: number }
  | { kind: 'setSpeedPercent'; percent: number }
  | { kind: 'startPrint'; filename: string; plateIndex: number };
```

**PENTING — lokasi test yang benar:** test connector Bambu yang sudah ada TIDAK ada di `src/connectors/*.test.ts`, tapi di `packages/printer-monitor-core/src/__tests__/bambu-connector.test.ts`. Jangan buat file baru di `src/connectors/` — extend file `__tests__/bambu-connector.test.ts` yang sudah ada, ikuti pola mock yang sudah dipakai test lain di file itu.

**PENTING — asumsi payload `project_file` BELUM diverifikasi** (beda kategori dengan asumsi bentuk union command di atas, yang sudah dikonfirmasi cocok). Command `project_file` untuk trigger print dari SD card belum diriset formatnya secara pasti — field `param`, apakah perlu `url: "file:///sdcard/<path>"` terpisah, dan terutama `use_ams: false` (hardcode ini KEMUNGKINAN MEMATIKAN AMS sepenuhnya, kontradiksi dengan keputusan spec "AMS mapping ikut default file" — kalau printer tidak pakai AMS sama sekali saat print, itu bug fungsional, bukan cuma gap dokumentasi). **Step 8 di bawah (verifikasi manual) WAJIB dilakukan sebelum PR ini di-merge, sama seriusnya dengan verifikasi Task 3 Step 7.**

- [ ] **Step 3: Baca implementasi `sendCommand` yang sudah ada**

Run: `grep -n "sendCommand\|publishAsync\|requestTopic\|client?.connected" packages/printer-monitor-core/src/connectors/bambu-mqtt.ts`

Konfirmasi pola nyata sebelum lanjut — struktur asli yang harus diikuti (bisa berbeda sedikit, verifikasi dulu): connector publish pakai `this.client.publishAsync(...)` (bukan `publish` biasa), topic request adalah variabel lokal yang dibangun di dalam `sendCommand()` (bukan field `this.requestTopic`), dan ada guard di awal `sendCommand()`: kalau `!this.client?.connected`, langsung `return {ok:false, message:'printer_offline'}` sebelum publish apa pun.

- [ ] **Step 4: Tulis test yang gagal untuk `BambuMqttConnector.sendCommand` varian `startPrint`**

Tambahkan `describe` baru ke `packages/printer-monitor-core/src/__tests__/bambu-connector.test.ts` (bukan file baru), ikuti pola mock `mqtt` yang sudah dipakai test lain di file itu untuk `connect()`. Poin kritis: connector harus di-`start()` dulu (supaya `this.client` terisi), dan mock client harus punya `connected: true` + method `publishAsync` (bukan `publish`) — kalau tidak, `sendCommand` akan selalu balik `printer_offline` lewat guard di Step 3, dan test akan lulus palsu (assert `ok:false` padahal yang mau ditest adalah jalur sukses).

```ts
// tambahan describe di packages/printer-monitor-core/src/__tests__/bambu-connector.test.ts
describe("BambuMqttConnector.sendCommand startPrint", () => {
  it("publish command project_file dengan filename dan plate_idx setelah connector connected", async () => {
    const mockPublishAsync = vi.fn().mockResolvedValue(undefined);
    // Sesuaikan bentuk mock client persis dengan yang dipakai test lain di file ini
    // (connected: true, publishAsync, dan method lain yang dipanggil start()/on-connect handler).
    const connector = new BambuMqttConnector({
      id: "dev1",
      name: "Test",
      type: "P1P",
      connector: "bambu",
      ip: "192.168.1.50",
      serial: "SERIAL1",
      accessCode: "12345678",
    });
    await connector.start();
    // Setelah start(), pastikan client mock terpasang dengan connected:true + publishAsync di atas
    // (lihat cara test lain di file ini menyuntikkan mock client — ikuti pola yang sama).

    const result = await connector.sendCommand({ kind: "startPrint", filename: "/model.gcode.3mf", plateIndex: 2 });

    expect(result.ok).toBe(true);
    expect(mockPublishAsync).toHaveBeenCalled();
    const [topic, payloadStr] = mockPublishAsync.mock.calls[0] as [string, string];
    expect(topic).toContain("request");
    const payload = JSON.parse(payloadStr);
    expect(payload.print.command).toBe("project_file");
    expect(payload.print.param).toBe("/model.gcode.3mf");
  });
});
```

- [ ] **Step 5: Jalankan test, pastikan gagal**

Run: `cd packages/printer-monitor-core && npx vitest run src/__tests__/bambu-connector.test.ts -t startPrint`
Expected: FAIL — `sendCommand` belum handle `kind: 'startPrint'`.

- [ ] **Step 6: Tambah case `startPrint` di `sendCommand`**

Tambahkan branch baru **setelah** guard `!this.client?.connected` yang sudah ada (jangan hapus guard itu), ikuti pola publish command lain di file yang sama persis (nama variabel topic, `publishAsync`, bentuk return):

```ts
// di dalam sendCommand(), setelah guard connected, tambahkan case baru
if (cmd.kind === "startPrint") {
  const payload = {
    print: {
      sequence_id: String(Date.now()),
      command: "project_file",
      param: cmd.filename,
      plate_idx: cmd.plateIndex,
      use_ams: true, // ASUMSI SEMENTARA — harus dikonfirmasi Step 8, kontradiksi kalau salah (lihat catatan di atas Step 3)
    },
  };
  await this.client.publishAsync(requestTopic, JSON.stringify(payload)); // nama variabel topic ikuti yang dipakai command lain di file ini
  return { ok: true };
}
```

Sesuaikan nama variabel topic dan struktur objek `{ok:true}` supaya cocok persis dengan command lain di file yang sama (baca dulu di Step 3, jangan asumsikan nama field benar tanpa verifikasi).

- [ ] **Step 7: Jalankan test, pastikan lulus**

Run: `cd packages/printer-monitor-core && npx vitest run src/__tests__/bambu-connector.test.ts -t startPrint`
Expected: PASS.

- [ ] **Step 8: Verifikasi manual payload `project_file` (WAJIB sebelum PR di-merge, catat di PR description)**

Dengan printer Bambu fisik (atau referensi source code tool open-source yang sudah dikonfirmasi bekerja, misal Bambu Studio/OrcaSlicer/HA Bambu Lab integration), konfirmasi: (a) apakah `param` cukup path SD card, atau butuh field `url` terpisah dengan skema `file:///sdcard/<path>`; (b) apakah `use_ams` harus `true` untuk print pakai AMS mapping default file (bukan `false` seperti draft awal task ini — `false` kemungkinan mematikan AMS sepenuhnya dan salah kirim print tanpa filament sesuai plan). Update payload di Step 6 sesuai temuan sebelum fitur dianggap selesai.

- [ ] **Step 9: Jalankan semua test printer-monitor-core untuk pastikan tidak ada regresi**

Run: `cd packages/printer-monitor-core && npx vitest run`
Expected: semua test PASS (termasuk test command lain yang sudah ada sebelumnya).

- [ ] **Step 10: Commit**

```bash
git add packages/printer-monitor-core/src/types.ts packages/printer-monitor-core/src/connectors/bambu-mqtt.ts packages/printer-monitor-core/src/__tests__/bambu-connector.test.ts
git commit -m "feat(printer-monitor-core): add startPrint command to Bambu MQTT connector"
```

---

### Task 6: Renderer — `FileManagerPanel.tsx` (grid, thumbnail, multi-select bulk download/delete)

**Files:**
- Create: `apps/agent/src/renderer/components/FileManagerPanel.tsx`
- Test: `apps/agent/src/renderer/components/FileManagerPanel.test.tsx`
- Modify: `apps/agent/src/main/ipc.ts` (tambah handler `agent:file-thumbnail`)
- Modify: `apps/agent/src/preload/index.ts` (tambah `getFileThumbnail`)

**Interfaces:**
- Consumes: `window.agentApi.listFiles`, `.uploadFile`, `.downloadFile`, `.deleteFile` (Task 2), `.getFileThumbnail` (baru di task ini, pola sama seperti `parse-3mf` — download temp lalu ekstrak `Metadata/plate_1.png` dari zip, return base64 data URL atau `null` kalau tidak ada thumbnail).
- Produces: komponen `<FileManagerPanel shortCode={string} />`, event callback `onPrintRequested: (remotePath: string) => void` (prop, dipanggil saat user klik "Print" pada satu file — dikonsumsi Task 7 untuk membuka `PrintStartDialog`).

- [ ] **Step 1: Tambah handler thumbnail (pola sama seperti Task 4, disingkat)**

```ts
// apps/agent/src/main/ipc.ts — tambah import di atas
import JSZip from "jszip";

ipcMain.handle("agent:file-thumbnail", async (_event, shortCode: string, remotePath: string): Promise<string | null> => {
  if (!remotePath.endsWith(".gcode.3mf")) return null;
  const client = await getFileClientFor(shortCode);
  const fileName = remotePath.split("/").pop() ?? "thumb.gcode.3mf";
  const tempPath = join(tmpdir(), `agent-thumb-${Date.now()}-${fileName}`);
  try {
    await client.download(remotePath, tempPath);
    const buffer = await readFile(tempPath);
    const zip = await JSZip.loadAsync(buffer);
    const png = zip.file("Metadata/plate_1.png");
    if (!png) return null;
    const base64 = await png.async("base64");
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  } finally {
    await rm(tempPath, { force: true });
  }
});
```

Tambah preload: `getFileThumbnail: (shortCode: string, remotePath: string): Promise<string | null> => ipcRenderer.invoke("agent:file-thumbnail", shortCode, remotePath),`

Tambah juga handler untuk native folder-picker (dipakai bulk download), pakai Electron `dialog`:

```ts
// apps/agent/src/main/ipc.ts — tambah import
import { dialog } from "electron";

ipcMain.handle("agent:pick-download-folder", async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
```

Tambah preload: `pickDownloadFolder: (): Promise<string | null> => ipcRenderer.invoke("agent:pick-download-folder"),`

- [ ] **Step 2: Tulis test yang gagal untuk render list + multi-select**

```tsx
// apps/agent/src/renderer/components/FileManagerPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileManagerPanel } from "./FileManagerPanel";

const mockListFiles = vi.fn();
const mockDeleteFile = vi.fn();
const mockGetFileThumbnail = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFileThumbnail.mockResolvedValue(null);
  (globalThis as unknown as { window: { agentApi: unknown } }).window ??= {} as never;
  Object.assign(window, {
    agentApi: {
      listFiles: mockListFiles,
      deleteFile: mockDeleteFile,
      getFileThumbnail: mockGetFileThumbnail,
      downloadFile: vi.fn(),
      uploadFile: vi.fn(),
      pickDownloadFolder: vi.fn().mockResolvedValue("/tmp/downloads"),
    },
  });
});

describe("FileManagerPanel", () => {
  it("render daftar file sebagai card setelah listFiles resolve", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 2100000, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);

    expect(await screen.findByText("a.gcode.3mf")).toBeInTheDocument();
  });

  it("mode select: centang 2 file lalu hapus bulk memanggil deleteFile 2 kali", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
      { name: "b.gcode", path: "/b.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    mockDeleteFile.mockResolvedValue(undefined);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getByLabelText("a.gcode.3mf"));
    fireEvent.click(screen.getByLabelText("b.gcode"));
    fireEvent.click(screen.getByRole("button", { name: /hapus \(2\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /ya, hapus/i }));

    await waitFor(() => {
      expect(mockDeleteFile).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf");
      expect(mockDeleteFile).toHaveBeenCalledWith("ABC123", "/b.gcode");
    });
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/renderer/components/FileManagerPanel.test.tsx`
Expected: FAIL — komponen belum ada.

- [ ] **Step 4: Implementasi `FileManagerPanel.tsx`**

```tsx
// apps/agent/src/renderer/components/FileManagerPanel.tsx
import { useEffect, useState, useCallback } from "react";
import type { PrinterFileEntry } from "../../main/file-manager/types";

interface FileManagerPanelProps {
  shortCode: string;
  onPrintRequested: (remotePath: string) => void;
}

export function FileManagerPanel({ shortCode, onPrintRequested }: FileManagerPanelProps) {
  const [entries, setEntries] = useState<PrinterFileEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [zoomedThumbnail, setZoomedThumbnail] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await window.agentApi.listFiles(shortCode, "/");
    setEntries(list);
    for (const entry of list) {
      if (entry.path.endsWith(".gcode.3mf")) {
        window.agentApi.getFileThumbnail(shortCode, entry.path).then((thumb) => {
          setThumbnails((prev) => ({ ...prev, [entry.path]: thumb }));
        });
      }
    }
  }, [shortCode]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function confirmBulkDelete() {
    for (const path of selected) {
      await window.agentApi.deleteFile(shortCode, path);
    }
    setSelected(new Set());
    setConfirmingBulkDelete(false);
    await load();
  }

  async function bulkDownload() {
    const targetFolder = await window.agentApi.pickDownloadFolder();
    if (!targetFolder) return; // user batal dialog folder
    for (const path of selected) {
      const fileName = path.split("/").pop() ?? "download";
      await window.agentApi.downloadFile(shortCode, path, `${targetFolder}/${fileName}`);
    }
  }

  return (
    <div>
      <div>
        <button onClick={() => setSelectMode((v) => !v)}>{selectMode ? "Batal Select" : "Select"}</button>
      </div>

      {selectMode && selected.size > 0 && (
        <div>
          <span>{selected.size} file dipilih</span>
          <button onClick={bulkDownload}>Download ({selected.size})</button>
          <button onClick={() => setConfirmingBulkDelete(true)}>Hapus ({selected.size})</button>
        </div>
      )}

      {confirmingBulkDelete && (
        <div role="dialog">
          <p>Yakin hapus {selected.size} file? Aksi ini tidak bisa dibatalkan.</p>
          <button onClick={confirmBulkDelete}>Ya, Hapus</button>
          <button onClick={() => setConfirmingBulkDelete(false)}>Batal</button>
        </div>
      )}

      {zoomedThumbnail && (
        <div role="dialog" aria-label="thumbnail preview" onClick={() => setZoomedThumbnail(null)}>
          <img src={zoomedThumbnail} alt="preview besar" />
        </div>
      )}

      <div>
        {entries.map((entry) => (
          <div key={entry.path}>
            {selectMode && !entry.isDirectory && (
              <input type="checkbox" aria-label={entry.name} checked={selected.has(entry.path)} onChange={() => toggleSelected(entry.path)} />
            )}
            {thumbnails[entry.path] ? (
              <img
                src={thumbnails[entry.path] ?? undefined}
                alt=""
                role="button"
                aria-label={`zoom ${entry.name}`}
                onClick={() => setZoomedThumbnail(thumbnails[entry.path] ?? null)}
                style={{ cursor: "zoom-in" }}
              />
            ) : (
              <span aria-hidden>🖼️</span>
            )}
            <span>{entry.name}</span>
            {!entry.isDirectory && <button onClick={() => onPrintRequested(entry.path)}>Print</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/renderer/components/FileManagerPanel.test.tsx`
Expected: PASS, 2 test.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/preload/index.ts apps/agent/src/renderer/components/FileManagerPanel.tsx apps/agent/src/renderer/components/FileManagerPanel.test.tsx
git commit -m "feat(agent): add FileManagerPanel with grid thumbnails and bulk select"
```

---

### Task 7: Renderer — `PrintStartDialog.tsx` (2-step plate picker + konfirmasi)

**Files:**
- Create: `apps/agent/src/renderer/components/PrintStartDialog.tsx`
- Test: `apps/agent/src/renderer/components/PrintStartDialog.test.tsx`

**Interfaces:**
- Consumes: `window.agentApi.parseThreemf(shortCode, remotePath): Promise<PlateInfo[]>` (Task 4), `window.agentApi.sendPrinterCommand(deviceId, cmd): Promise<CommandResult>` (sudah ada di preload, sekarang menerima `cmd.kind === 'startPrint'` dari Task 5).
- Produces: komponen `<PrintStartDialog shortCode={string} deviceLabel={string} remotePath={string} onClose={() => void} />`.

- [ ] **Step 1: Tulis test yang gagal**

```tsx
// apps/agent/src/renderer/components/PrintStartDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintStartDialog } from "./PrintStartDialog";

const mockParseThreemf = vi.fn();
const mockSendPrinterCommand = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(window, {
    agentApi: { parseThreemf: mockParseThreemf, sendPrinterCommand: mockSendPrinterCommand },
  });
});

describe("PrintStartDialog", () => {
  it("langkah 1: pilih plate, langkah 2: konfirmasi, baru kirim command", async () => {
    mockParseThreemf.mockResolvedValue([
      { index: 1, filaments: [{ id: 1, color: "#FEFEFE", type: "PLA", amsSlot: 1 }] },
      { index: 2, filaments: [{ id: 1, color: "#FF0000", type: "PETG", amsSlot: 2 }] },
    ]);
    mockSendPrinterCommand.mockResolvedValue({ ok: true });

    render(<PrintStartDialog shortCode="ABC123" deviceLabel="Bambu X1C" remotePath="/model.gcode.3mf" onClose={vi.fn()} />);

    await screen.findByText(/plate 1/i);
    fireEvent.click(screen.getByText(/plate 2/i));

    // command belum terkirim di langkah 1
    expect(mockSendPrinterCommand).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /lanjut/i }));
    await screen.findByText(/yakin/i);

    fireEvent.click(screen.getByRole("button", { name: /ya, mulai print/i }));

    await waitFor(() => {
      expect(mockSendPrinterCommand).toHaveBeenCalledWith("ABC123", {
        kind: "startPrint",
        filename: "/model.gcode.3mf",
        plateIndex: 2,
      });
    });
  });

  it("file .gcode polos: skip plate picker, langsung ke konfirmasi", async () => {
    mockSendPrinterCommand.mockResolvedValue({ ok: true });

    render(<PrintStartDialog shortCode="ABC123" deviceLabel="Bambu X1C" remotePath="/test_calibration.gcode" onClose={vi.fn()} />);

    await screen.findByText(/yakin/i);
    expect(mockParseThreemf).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /ya, mulai print/i }));

    await waitFor(() => {
      expect(mockSendPrinterCommand).toHaveBeenCalledWith("ABC123", {
        kind: "startPrint",
        filename: "/test_calibration.gcode",
        plateIndex: 1,
      });
    });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/renderer/components/PrintStartDialog.test.tsx`
Expected: FAIL — komponen belum ada.

- [ ] **Step 3: Implementasi `PrintStartDialog.tsx`**

```tsx
// apps/agent/src/renderer/components/PrintStartDialog.tsx
import { useEffect, useState } from "react";
import type { PlateInfo } from "../../main/file-manager/threemf-parser";

interface PrintStartDialogProps {
  shortCode: string;
  deviceLabel: string;
  remotePath: string;
  onClose: () => void;
}

type Step = "loading" | "pick-plate" | "confirm" | "sending" | "error";

// File .gcode polos (bukan .gcode.3mf) tidak punya metadata plate/AMS — parseThreemf akan
// throw "not_bambu_3mf". Ini BUKAN error sungguhan untuk kasus ini, cuma sinyal "skip plate picker".
function isPlainGcode(remotePath: string): boolean {
  return remotePath.endsWith(".gcode") && !remotePath.endsWith(".gcode.3mf");
}

export function PrintStartDialog({ shortCode, deviceLabel, remotePath, onClose }: PrintStartDialogProps) {
  const [step, setStep] = useState<Step>("loading");
  const [plates, setPlates] = useState<PlateInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isPlainGcode(remotePath)) {
      // Plain gcode: tidak ada plate, langsung ke langkah konfirmasi (plateIndex 1 sebagai default).
      setSelectedIndex(1);
      setStep("confirm");
      return;
    }
    window.agentApi
      .parseThreemf(shortCode, remotePath)
      .then((result) => {
        setPlates(result);
        setSelectedIndex(result[0]?.index ?? null);
        setStep("pick-plate");
      })
      .catch(() => setStep("error"));
  }, [shortCode, remotePath]);

  async function handleConfirm() {
    if (selectedIndex === null) return;
    setStep("sending");
    const result = await window.agentApi.sendPrinterCommand(shortCode, {
      kind: "startPrint",
      filename: remotePath,
      plateIndex: selectedIndex,
    });
    if (!result.ok) {
      setErrorMessage("tidak yakin apakah print dimulai, cek langsung ke printer");
      setStep("error");
      return;
    }
    onClose();
  }

  if (step === "loading") return <div role="dialog">Membaca metadata file...</div>;
  if (step === "error") return <div role="dialog">{errorMessage ?? "File bukan format Bambu yang valid"}<button onClick={onClose}>Tutup</button></div>;

  const selectedPlate = plates.find((p) => p.index === selectedIndex);

  return (
    <div role="dialog">
      {step === "pick-plate" && (
        <>
          <h3>Print: {remotePath.split("/").pop()}</h3>
          <p>Pilih plate</p>
          {plates.map((plate) => (
            <button key={plate.index} onClick={() => setSelectedIndex(plate.index)} aria-pressed={plate.index === selectedIndex}>
              Plate {plate.index}
            </button>
          ))}
          <p>AMS mapping (default file)</p>
          <ul>
            {selectedPlate?.filaments.map((f) => (
              <li key={f.id}>
                Filament {f.id} ({f.type} {f.color}) → AMS slot {f.amsSlot}
              </li>
            ))}
          </ul>
          <button onClick={onClose}>Batal</button>
          <button onClick={() => setStep("confirm")}>Lanjut</button>
        </>
      )}

      {step === "confirm" && (
        <>
          <h3>Konfirmasi Print</h3>
          <p>
            Printer <b>{deviceLabel}</b> akan mulai print {plates.length > 0 ? `plate ${selectedIndex}` : remotePath.split("/").pop()}. Yakin? Aksi ini tidak bisa dibatalkan setelah dimulai.
          </p>
          <button onClick={() => setStep("pick-plate")}>Batal</button>
          <button onClick={handleConfirm}>Ya, Mulai Print</button>
        </>
      )}

      {step === "sending" && <p>Mengirim command...</p>}
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/renderer/components/PrintStartDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/renderer/components/PrintStartDialog.tsx apps/agent/src/renderer/components/PrintStartDialog.test.tsx
git commit -m "feat(agent): add two-step PrintStartDialog with plate picker and confirmation"
```

---

### Task 8: Renderer — `FileDropOverlay.tsx` + wiring di `DashboardScreen.tsx`

**Files:**
- Create: `apps/agent/src/renderer/components/FileDropOverlay.tsx`
- Test: `apps/agent/src/renderer/components/FileDropOverlay.test.tsx`
- Modify: `apps/agent/src/renderer/screens/DashboardScreen.tsx` (wire tab "Files" pakai `FileManagerPanel`, drop-zone pakai `FileDropOverlay`, render `PrintStartDialog` saat `onPrintRequested` dipanggil)

**Interfaces:**
- Consumes: `window.agentApi.uploadFile` (Task 2), komponen `PrintStartDialog` (Task 7), `FileManagerPanel` (Task 6).
- Produces: komponen `<FileDropOverlay shortCode={string} deviceLabel={string} onUploaded={(remotePath: string) => void} />`.

- [ ] **Step 1: Tulis test yang gagal untuk validasi ekstensi + ukuran**

```tsx
// apps/agent/src/renderer/components/FileDropOverlay.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FileDropOverlay } from "./FileDropOverlay";

const mockUploadFile = vi.fn();
const mockGetPathForFile = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPathForFile.mockImplementation((file: File) => `/fake/dropped/${file.name}`);
  Object.assign(window, { agentApi: { uploadFile: mockUploadFile, getPathForFile: mockGetPathForFile } });
});

function makeFile(name: string, sizeBytes: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("FileDropOverlay", () => {
  it("block file lebih dari 4GB tanpa memanggil uploadFile", () => {
    const onUploaded = vi.fn();
    const { container } = render(<FileDropOverlay shortCode="ABC123" deviceLabel="Bambu X1C" onUploaded={onUploaded} />);
    const dropTarget = container.firstChild as Element;

    const bigFile = makeFile("huge.gcode", 5 * 1024 * 1024 * 1024);
    fireEvent.drop(dropTarget, { dataTransfer: { files: [bigFile] } });

    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("upload file valid lalu panggil onUploaded dengan remote path", async () => {
    mockUploadFile.mockResolvedValue(undefined);
    const onUploaded = vi.fn();
    const { container } = render(<FileDropOverlay shortCode="ABC123" deviceLabel="Bambu X1C" onUploaded={onUploaded} />);
    const dropTarget = container.firstChild as Element;

    const validFile = makeFile("model.gcode.3mf", 2 * 1024 * 1024);
    fireEvent.drop(dropTarget, { dataTransfer: { files: [validFile] } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockUploadFile).toHaveBeenCalledWith("ABC123", expect.any(String), "/model.gcode.3mf");
    expect(onUploaded).toHaveBeenCalledWith("/model.gcode.3mf");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/renderer/components/FileDropOverlay.test.tsx`
Expected: FAIL — komponen belum ada.

- [ ] **Step 3: Tambah preload method `getPathForFile` (WAJIB — `File.path` sudah dihapus dari Electron sejak versi 32; repo ini pakai Electron lebih baru, jadi `file.path` akan selalu `undefined` di runtime meski tidak terdeteksi test yang di-mock)**

```ts
// apps/agent/src/preload/index.ts — tambah import di atas
import { webUtils } from "electron";

// tambahkan ke object agentApi
getPathForFile: (file: File): string => webUtils.getPathForFile(file),
```

- [ ] **Step 4: Implementasi `FileDropOverlay.tsx`**

```tsx
// apps/agent/src/renderer/components/FileDropOverlay.tsx
import { useState, type DragEvent } from "react";

const HARD_BLOCK_BYTES = 4 * 1024 * 1024 * 1024;
const SOFT_WARN_BYTES = 500 * 1024 * 1024;

interface FileDropOverlayProps {
  shortCode: string;
  deviceLabel: string;
  onUploaded: (remotePath: string) => void;
}

export function FileDropOverlay({ shortCode, deviceLabel, onUploaded }: FileDropOverlayProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;

    const isGcodeFile = file.name.endsWith(".gcode.3mf") || file.name.endsWith(".gcode");
    if (!isGcodeFile) {
      setError("Hanya file .gcode atau .gcode.3mf yang didukung");
      return;
    }
    if (file.size >= HARD_BLOCK_BYTES) {
      setError("File terlalu besar (maks 4GB)");
      return;
    }
    if (file.size > SOFT_WARN_BYTES) {
      // eslint-disable-next-line no-console
      console.warn("File besar (>500MB), upload mungkin lambat");
    }

    setError(null);
    const remotePath = `/${file.name}`;
    const localPath = window.agentApi.getPathForFile(file);
    try {
      await window.agentApi.uploadFile(shortCode, localPath, remotePath);
      onUploaded(remotePath);
    } catch {
      setError("Upload gagal — printer offline atau koneksi terputus");
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {dragging && <div>Drop untuk kirim ke {deviceLabel}</div>}
      {error && <div role="alert">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd apps/agent && npx vitest run src/renderer/components/FileDropOverlay.test.tsx`
Expected: PASS, 2 test.

- [ ] **Step 6: Wire ke `DashboardScreen.tsx`**

Baca dulu struktur render device card di `apps/agent/src/renderer/screens/DashboardScreen.tsx` sekitar baris 229-268 (tempat `<PrinterControls>` di-append per device) untuk menyamakan pola state management yang sudah ada, lalu tambahkan di card yang sama: state lokal `printDialogPath: string | null` per device, render `<FileDropOverlay>` membungkus card, render `<FileManagerPanel onPrintRequested={setPrintDialogPath}>` di tab "Files", dan render `<PrintStartDialog>` secara kondisional saat `printDialogPath` terisi.

- [ ] **Step 7: Jalankan full test suite agent untuk pastikan tidak ada regresi**

Run: `cd apps/agent && npx vitest run`
Expected: semua test PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/preload/index.ts apps/agent/src/renderer/components/FileDropOverlay.tsx apps/agent/src/renderer/components/FileDropOverlay.test.tsx apps/agent/src/renderer/screens/DashboardScreen.tsx
git commit -m "feat(agent): wire drag-and-drop upload + print dialog into device dashboard"
```

---

## Setelah semua task selesai

- Jalankan `pnpm --filter @3pb/agent test` dan `pnpm --filter @3pb/printer-monitor-core test` dari root repo untuk konfirmasi semua test lulus bersamaan.
- **E2E manual wajib** (tidak bisa diotomasi dari sesi agent): dengan printer Bambu fisik, verifikasi upload → parse plate → pilih plate → konfirmasi → print benar-benar mulai, dan drag-drop dari luar Agent berfungsi.
- PR description harus mencantumkan hasil verifikasi manual Task 3 Step 7 (apakah key `index` di XML sudah benar) dan Task 5 Step 8 (apakah nama field topic/payload MQTT `project_file`, termasuk keputusan `use_ams`, sudah dikonfirmasi terhadap kode asli/printer fisik, bukan asumsi).

## Out of scope v1 (deklarasi eksplisit, bukan celah tak sengaja)

- **UI rename file**: handler IPC `agent:file-rename` + preload `renameFile` sudah dibuat (Task 2), tapi TIDAK ada tombol/dialog rename di `FileManagerPanel.tsx`. Kalau dibutuhkan, ini task tambahan kecil terpisah — API-nya sudah siap dipakai.
- Semua item yang sudah tercatat di spec bagian "Out of scope (v1)": Moonraker/Fluidd, override AMS mapping saat print-start, retry otomatis, resume partial upload FTPS, deep-link ke Bambu Studio/Handy.
