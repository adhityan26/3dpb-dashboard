import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const constructorOptions: Record<string, unknown>[] = [];
// vi.mock factory di bawah di-hoist ke atas file -- setApplicationMenu harus lewat vi.hoisted()
// biar tersedia saat factory jalan (pola sama tray.test.ts).
const { setApplicationMenu } = vi.hoisted(() => ({ setApplicationMenu: vi.fn() }));

vi.mock("electron", () => ({
  BrowserWindow: class {
    webContents = { openDevTools: vi.fn() };
    constructor(opts: Record<string, unknown>) {
      constructorOptions.push(opts);
    }
    loadURL = vi.fn();
  },
  Menu: { setApplicationMenu },
}));

import { createWindow, disableApplicationMenu } from "./window";

type WebPreferences = {
  preload: string;
  contextIsolation: boolean;
  nodeIntegration: boolean;
  sandbox: boolean;
};

beforeEach(() => {
  constructorOptions.length = 0;
  setApplicationMenu.mockClear();
});

describe("disableApplicationMenu", () => {
  it("panggil Menu.setApplicationMenu(null) -- hilangkan menu bar bawaan (File/Edit/View/dst)", () => {
    disableApplicationMenu();
    expect(setApplicationMenu).toHaveBeenCalledWith(null);
  });
});

describe("createWindow webPreferences", () => {
  it("preload menunjuk ke .mjs, BUKAN .js — package ini `type: module` jadi electron-vite mengemit out/preload/index.mjs", () => {
    createWindow();
    const webPreferences = constructorOptions[0].webPreferences as WebPreferences;
    // Salah ekstensi = Electron cuma nge-log "Unable to load preload script" lalu LANJUT:
    // contextBridge tak pernah jalan, window.agentApi undefined, dan effect mount App.tsx
    // langsung TypeError di window kosong (tak ada error boundary di src/renderer).
    expect(path.basename(webPreferences.preload)).toBe("index.mjs");
    expect(webPreferences.preload.endsWith(".js")).toBe(false);
  });

  it("sandbox: false — preload yang di-sandbox dijalankan sebagai plain JS tanpa konteks ESM, padahal bundle preload kita ESM", () => {
    createWindow();
    const webPreferences = constructorOptions[0].webPreferences as WebPreferences;
    // Sejak Electron 20 renderer di-sandbox by default; `nodeIntegration: false` TIDAK
    // mematikannya. Tanpa baris ini, memperbaiki ekstensi saja belum cukup.
    expect(webPreferences.sandbox).toBe(false);
  });

  it("isolasi konteks tetap menyala dan nodeIntegration tetap mati (sandbox:false bukan alasan melonggarkan dua ini)", () => {
    createWindow();
    const webPreferences = constructorOptions[0].webPreferences as WebPreferences;
    expect(webPreferences.contextIsolation).toBe(true);
    expect(webPreferences.nodeIntegration).toBe(false);
  });

  it("nama file preload yang dirujuk BENAR-BENAR ada di antara file yang diemit electron-vite (dilewati kalau belum pernah build)", () => {
    createWindow();
    const webPreferences = constructorOptions[0].webPreferences as WebPreferences;
    const outPreloadDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../out/preload",
    );
    if (!fs.existsSync(outPreloadDir)) {
      // out/ di-gitignore; di clone bersih / CI tanpa build, kontrak ekstensi di test-test
      // di atas yang jadi penjaganya.
      expect(path.basename(webPreferences.preload)).toBe("index.mjs");
      return;
    }
    expect(fs.readdirSync(outPreloadDir)).toContain(path.basename(webPreferences.preload));
  });
});
