import { BrowserWindow, Menu } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'
import { isDev } from './utils'

/**
 * Hilangkan menu bar bawaan Electron (File/Edit/View/Window/Help) -- app ini punya nav sendiri
 * di dalam window, menu bar OS itu cuma noise buat user awam.
 *
 * Efek samping yang DITERIMA: shortcut Cmd+Q/Cmd+W (mac) ikut hilang karena biasanya dipasok
 * lewat item menu bawaan -- tapi app ini SUDAH sengaja tak quit lewat close window
 * (attachHideOnClose di index.ts, quit sungguhan cuma dari "Keluar" di tray), jadi kehilangan
 * Cmd+W justru selaras, bukan regresi. Copy/paste (Cmd+C/Cmd+V dll) di field teks form
 * pairing TETAP jalan -- itu perilaku native Chromium buat elemen `<input>` fokus, independen
 * dari Menu aplikasi Electron.
 */
export function disableApplicationMenu(): void {
  Menu.setApplicationMenu(null)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Dua setelan di bawah SALING TERIKAT — jangan ubah salah satunya sendirian.
 *
 * 1. Ekstensi `.mjs` (BUKAN `.js`). `apps/agent/package.json` punya `"type": "module"`,
 *    dan electron-vite menurunkan format build preload dari situ:
 *    `format = pkg.type === 'module' && supportESM() ? 'es' : 'cjs'`, lalu untuk format
 *    'es' dia MEMAKSA `entryFileNames = '[name].mjs'`
 *    (node_modules/electron-vite/dist/chunks/lib-*.mjs). Jadi file yang benar-benar
 *    diemit adalah `out/preload/index.mjs`; `out/preload/index.js` TIDAK PERNAH ada.
 *    Dokumentasi Electron sendiri mewajibkan hal yang sama: "Preload scripts will ignore
 *    `"type": "module"` fields, so you must use the `.mjs` file extension in your ESM
 *    preload scripts." Salah ekstensi = Electron cuma nge-log "Unable to load preload
 *    script" lalu LANJUT — `contextBridge.exposeInMainWorld` tak pernah jalan,
 *    `window.agentApi` undefined, dan effect mount App.tsx langsung TypeError di window
 *    kosong tanpa error boundary.
 *
 * 2. `sandbox: false`. Sejak Electron 20 renderer di-sandbox secara default (dan
 *    `nodeIntegration: false` TIDAK mematikan sandbox — yang mematikannya justru
 *    `nodeIntegration: true`). Preload yang di-sandbox "are run as plain JavaScript
 *    without an ESM context" (dok Electron), padahal bundle preload kita ESM asli
 *    (`import { contextBridge, ipcRenderer } from "electron"`). Jadi `.mjs` saja tanpa
 *    `sandbox: false` tetap gagal load. Ini pola yang sama dengan template ESM resmi
 *    electron-vite. `contextIsolation: true` + `nodeIntegration: false` tetap dipertahankan.
 */
export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../renderer/index.html')}`

  mainWindow.loadURL(url)

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  return mainWindow
}
