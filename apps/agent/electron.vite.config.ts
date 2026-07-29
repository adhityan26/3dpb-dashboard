import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Paket workspace internal (`workspace:*`) TIDAK punya build step — package.json-nya
// mengekspor `./src/index.ts` MENTAH. Kalau ikut di-externalize seperti dependency npm
// biasa, `out/main/index.js` menyimpan `import ... from "@3pb/printer-monitor-core"` dan
// Node (Electron main) langsung mati ERR_MODULE_NOT_FOUND saat app dijalankan — file .ts
// tak bisa di-load Node. Jadi dua paket ini WAJIB di-exclude supaya Vite mem-bundle
// sumbernya ke dalam bundle main. `aedes`/`bonjour-service`/`mqtt` sebaliknya TETAP
// external: paket npm dengan entry JS terkompilasi, lebih aman di-resolve dari
// node_modules (dan tak perlu ikut di-bundle).
const WORKSPACE_TS_PACKAGES = ['@3pb/printer-monitor-core', '@3pb/cyd-layout-schema']

// Base URL SaaS di-inject SAAT BUILD (design spec: konfigurasi build-time, bukan setting
// yang di-expose ke user awam). Tanpa ini, di app terpaket `process.env.SAAS_BASE_URL`
// selalu undefined -> semua fetch jadi path relatif -> setiap panggilan SaaS (aktivasi,
// devices, layout) gagal jadi "network_error" tanpa jejak diagnostik.
// Override saat build:
//   SAAS_BASE_URL=http://192.168.88.113:3300 pnpm --filter @3pb/agent build
const DEFAULT_SAAS_BASE_URL = 'https://app.slizebiz.com'
const saasBaseUrl = process.env.SAAS_BASE_URL ?? DEFAULT_SAAS_BASE_URL

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_TS_PACKAGES })],
    define: {
      __SAAS_BASE_URL__: JSON.stringify(saasBaseUrl)
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_TS_PACKAGES })]
  },
  renderer: {
    resolve: {
      alias: {
        '@': path.resolve('src/renderer')
      }
    },
    plugins: [react()]
  }
})
