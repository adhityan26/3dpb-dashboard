import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

// `package.json` ini punya `"type": "module"` -- `__dirname` bukan global di konteks ESM
// murni (beda dari config CJS lama), jadi diturunkan manual dari `import.meta.url` (pola
// sama dengan src/main/window.ts).
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

// Versi app (package.json) di-inject saat build sama seperti SAAS_BASE_URL -- dikirim lewat
// header X-Agent-Version di tiap request ke SaaS (saas-client.ts), dicatat server-side
// (AgentToken.agentVersion) supaya admin bisa lihat user komplain pakai versi berapa.
const agentVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version

// Commit hash git di-inject SAAT BUILD juga (pola sama dgn agentVersion). Selama fase
// staging, versi package.json tak pernah naik tiap rebuild (butuh konfirmasi eksplisit user
// -- lihat CLAUDE.md), jadi commit hash inilah satu-satunya cara admin/user bedain "build
// yang saya test barusan" dari build sebelumnya (nama file installer + header
// X-Agent-Version + footer di dalam app -- lihat build-installer.mjs, saas-client.ts,
// build-info.ts). Fallback "nogit" kalau command git gagal (bukan git repo/git tak
// terpasang) -- jangan sampai build APLIKASI gagal cuma gara-gara metadata diagnostik ini.
function readCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    return 'nogit'
  }
}
const commitHash = readCommitHash()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_TS_PACKAGES })],
    define: {
      __SAAS_BASE_URL__: JSON.stringify(saasBaseUrl),
      __AGENT_VERSION__: JSON.stringify(agentVersion),
      __AGENT_COMMIT_HASH__: JSON.stringify(commitHash)
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
    define: {
      __AGENT_VERSION__: JSON.stringify(agentVersion),
      __AGENT_COMMIT_HASH__: JSON.stringify(commitHash)
    },
    plugins: [react(), tailwindcss()]
  }
})
