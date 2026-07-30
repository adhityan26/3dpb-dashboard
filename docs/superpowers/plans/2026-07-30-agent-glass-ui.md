# Agent Glass UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `apps/agent`'s 3 layar (Activation/Pairing/Dashboard) pakai design system Glass UI 3DPB (`@3pb/ui`), tema dark tetap tanpa toggle, tanpa mengubah behavior apa pun.

**Architecture:** Tambah Tailwind v4 (via `@tailwindcss/vite` plugin) + `@3pb/ui` sebagai dependency baru `apps/agent`. Satu komponen pembungkus baru (`AgentShell`) menyediakan background+logo+card container yang dipakai ketiga layar. Restyle tiap layar existing pakai `GlassCard`/`GlassButton`/`GlassInput` + class warna (`g-t1..g-t5`, `g-success`/`g-warning`/`g-error`/`g-info`) — murni ganti `className`, logic/JSX-structure (element role, id/htmlFor, teks tombol) tetap identik.

**Tech Stack:** Tailwind CSS v4 (`@tailwindcss/vite`), `@3pb/ui` (workspace package, React 19 peer tapi component-nya plain — aman di React 18), React 18.3.1 (sudah ada).

## Global Constraints

- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum perintah apa pun.
- **Murni styling — TIDAK ADA perubahan logic/behavior.** Semua test yang sudah ada (`ActivationScreen.test.tsx`, `PairingScreen.test.tsx`, `DashboardScreen.test.tsx`, `App.test.tsx`) harus tetap 100% lulus TANPA modifikasi assertion — hanya `className`/JSX wrapper yang berubah. Kalau ada test yang perlu diubah supaya lulus, itu tanda restyle-nya salah, bukan tanda test-nya perlu diperbarui.
- **`@3pb/ui`'s `peerDependencies: {react: ^19, react-dom: ^19}` vs `apps/agent`'s React `^18.3.1` — MISMATCH INI DITERIMA, JANGAN DIPERBAIKI.** Komponennya (`GlassCard`/`GlassButton`/`GlassInput`) sudah dikonfirmasi cuma function component polos (`HTMLAttributes`/`ButtonHTMLAttributes`/`InputHTMLAttributes` passthrough), tidak pakai API React-19-spesifik apa pun. `pnpm install` akan menampilkan warning peer-dependency — itu EXPECTED, bukan bug untuk di-fix (jangan bump React `apps/agent` ke v19, itu proyek terpisah kalau memang diperlukan nanti).
- **Tailwind v4 via `@tailwindcss/vite` (plugin Vite-native), BUKAN `@tailwindcss/postcss`.** `apps/agent`'s renderer adalah build Vite murni (lewat `electron-vite`), beda dari `apps/landing` (Next.js, pakai PostCSS) — pilih plugin yang sesuai tipe build-nya.
- **Dark tetap, TIDAK ADA toggle/next-themes.** `apps/agent` adalah window utility background, bukan web app harian — cukup class `dark` permanen di elemen root.
- **JANGAN `git add -A`/`git add .`** — selalu `git add <path spesifik>`.
- Referensi desain lengkap (token warna, pola glass-card): skill `glass-ui-theme` (`~/.claude/skills/glass-ui-theme/SKILL.md`) dan `docs/superpowers/specs/2026-07-30-agent-glass-ui-design.md`.

---

## File Structure

**Baru:**
- `apps/agent/src/renderer/styles/globals.css` — entry Tailwind + import `@3pb/ui/glass.css` + custom-variant `dark`.
- `apps/agent/src/renderer/AgentShell.tsx` — pembungkus bersama (background gradient, logo, card container) dipakai ketiga layar.
- `apps/agent/src/renderer/AgentShell.test.tsx`
- `apps/agent/src/renderer/public/logo.svg` — copy dari `apps/saas/public/logo.svg` (asset publik Vite, diakses via path absolut `/logo.svg`).

**Dimodifikasi:**
- `apps/agent/package.json` — tambah `@3pb/ui` (dependencies), `tailwindcss`+`@tailwindcss/vite` (devDependencies).
- `apps/agent/electron.vite.config.ts` — tambah plugin Tailwind ke `renderer.plugins`.
- `apps/agent/src/renderer/index.html` — tambah `class="dark"` ke `<div id="root">`.
- `apps/agent/src/renderer/main.tsx` — import `./styles/globals.css`.
- `apps/agent/src/renderer/screens/ActivationScreen.tsx` — restyle, bungkus `AgentShell`.
- `apps/agent/src/renderer/screens/PairingScreen.tsx` — restyle, bungkus `AgentShell`.
- `apps/agent/src/renderer/screens/DashboardScreen.tsx` — restyle, bungkus `AgentShell`, tambah pemetaan warna status printer.

**Tidak disentuh:** semua file test yang sudah ada (assertion-nya harus tetap valid tanpa modifikasi), semua file `apps/agent/src/main/**` dan `apps/agent/src/preload/**` (murni renderer/UI, tak ada perubahan logic main-process).

---

### Task 1: Tooling (Tailwind v4 + `@3pb/ui`) + `AgentShell`

**Files:**
- Modify: `apps/agent/package.json`
- Modify: `apps/agent/electron.vite.config.ts`
- Modify: `apps/agent/src/renderer/index.html`
- Modify: `apps/agent/src/renderer/main.tsx`
- Create: `apps/agent/src/renderer/styles/globals.css`
- Create: `apps/agent/src/renderer/public/logo.svg`
- Create: `apps/agent/src/renderer/AgentShell.tsx`
- Create: `apps/agent/src/renderer/AgentShell.test.tsx`

**Interfaces:**
- Consumes: `GlassCard` dari `@3pb/ui`.
- Produces: `AgentShell({children}: {children: React.ReactNode})` — komponen React, dipakai Task 2/3/4 buat bungkus isi tiap layar.

- [ ] **Step 1: Tambah dependency ke `package.json`**

Edit `apps/agent/package.json`, tambahkan ke `dependencies`:
```json
"@3pb/ui": "workspace:*",
```
Tambahkan ke `devDependencies`:
```json
"tailwindcss": "^4",
"@tailwindcss/vite": "^4",
```

- [ ] **Step 2: Install**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis && pnpm install`
Expected: sukses. Warning peer-dependency (`@3pb/ui` minta React `^19`, `apps/agent` punya `^18.3.1`) BOLEH muncul — itu expected (lihat Global Constraints), bukan kegagalan.

- [ ] **Step 3: Tambah plugin Tailwind ke `electron.vite.config.ts`**

Edit `apps/agent/electron.vite.config.ts` — tambah import di atas, dan masukkan ke `renderer.plugins`:

```typescript
import tailwindcss from '@tailwindcss/vite'
```

Ubah blok `renderer` jadi:
```typescript
  renderer: {
    resolve: {
      alias: {
        '@': path.resolve('src/renderer')
      }
    },
    plugins: [react(), tailwindcss()]
  }
```
(baris lain di file — `main`, `preload`, komentar existing — TIDAK berubah.)

- [ ] **Step 4: Buat `globals.css`**

```css
/* apps/agent/src/renderer/styles/globals.css */
@import "tailwindcss";
@import "@3pb/ui/glass.css";
@custom-variant dark (&:is(.dark *));
```

(Pola identik dengan `apps/landing/app/globals.css` — konsisten satu ekosistem.)

- [ ] **Step 5: Copy logo**

Run: `cp /Users/adhityatangahu/Documents/shopee-analysis/apps/saas/public/logo.svg /Users/adhityatangahu/Documents/shopee-analysis/apps/agent/src/renderer/public/logo.svg`

(Vite renderer root `apps/agent/src/renderer/` — folder `public/` di situ otomatis di-copy ke `out/renderer/` saat build, diakses lewat path absolut `/logo.svg`.)

- [ ] **Step 6: Wire `globals.css` + class `dark` di root**

Edit `apps/agent/src/renderer/main.tsx`, tambah baris import PALING ATAS (sebelum import lain):
```typescript
import './styles/globals.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

Edit `apps/agent/src/renderer/index.html`, ubah `<div id="root"></div>` jadi:
```html
    <div id="root" class="dark"></div>
```

- [ ] **Step 7: Tulis failing test buat `AgentShell`**

```typescript
// apps/agent/src/renderer/AgentShell.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentShell } from "./AgentShell";

describe("AgentShell", () => {
  it("render children di dalam shell", () => {
    render(
      <AgentShell>
        <p>Isi layar</p>
      </AgentShell>,
    );
    expect(screen.getByText("Isi layar")).toBeTruthy();
  });

  it("tampilkan logo Slizebiz", () => {
    render(
      <AgentShell>
        <p>x</p>
      </AgentShell>,
    );
    expect(screen.getByAltText(/slizebiz/i)).toBeTruthy();
  });
});
```

- [ ] **Step 8: Jalankan test, pastikan gagal**

Run: `cd apps/agent && npx vitest run src/renderer/AgentShell.test.tsx`
Expected: FAIL — `./AgentShell` belum ada.

- [ ] **Step 9: Implementasi `AgentShell.tsx`**

```tsx
// apps/agent/src/renderer/AgentShell.tsx
import type { ReactNode } from "react";
import { GlassCard } from "@3pb/ui";

export function AgentShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-glass-page min-h-screen flex flex-col items-center justify-center p-6">
      <img src="/logo.svg" alt="Slizebiz" className="h-8 mb-6" />
      <GlassCard className="w-full max-w-xl p-6">{children}</GlassCard>
    </div>
  );
}
```

- [ ] **Step 10: Jalankan test, pastikan lolos**

Run: `cd apps/agent && npx vitest run src/renderer/AgentShell.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 11: Verifikasi build sungguhan menghasilkan CSS Tailwind — bukan cuma exit 0**

Run: `cd apps/agent && rm -rf out && npx electron-vite build`
Expected: exit 0.

Lalu cek CSS hasil build benar-benar berisi output Tailwind (bukan file CSS kosong/gagal-diam):
Run: `grep -rl "bg-glass-page\|g-card" apps/agent/out/renderer/assets/*.css`
Expected: menemukan minimal 1 file (membuktikan `glass.css` ke-import & Tailwind plugin genuinely jalan, bukan cuma "tidak error" tapi CSS-nya kosong).

- [ ] **Step 12: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/agent/package.json apps/agent/electron.vite.config.ts apps/agent/src/renderer/index.html apps/agent/src/renderer/main.tsx apps/agent/src/renderer/styles/globals.css apps/agent/src/renderer/public/logo.svg apps/agent/src/renderer/AgentShell.tsx apps/agent/src/renderer/AgentShell.test.tsx pnpm-lock.yaml
git commit -m "feat(agent): setup Tailwind v4 + @3pb/ui, AgentShell wrapper (background+logo+card)"
```

---

### Task 2: Restyle `ActivationScreen`

**Files:**
- Modify: `apps/agent/src/renderer/screens/ActivationScreen.tsx`

**Interfaces:**
- Consumes: `AgentShell` (Task 1), `GlassButton`/`GlassInput` dari `@3pb/ui`.

**Tidak ada perubahan logic** — `handleSubmit()`, state, pesan error per-kind SEMUA tetap identik. Hanya JSX return yang berubah.

- [ ] **Step 1: Jalankan test existing, konfirmasi baseline hijau**

Run: `cd apps/agent && npx vitest run src/renderer/screens/ActivationScreen.test.tsx`
Expected: PASS (4/4) — ini baseline SEBELUM restyle, bukti restyle nanti tidak "kebetulan" lulus.

- [ ] **Step 2: Restyle**

Ganti isi `apps/agent/src/renderer/screens/ActivationScreen.tsx` jadi:

```tsx
import { useState } from "react";
import type { SaasDevice } from "../../main/saas-client";
import { AgentShell } from "../AgentShell";
import { GlassButton, GlassInput } from "@3pb/ui";

export function ActivationScreen({ onActivated }: { onActivated: (devices: SaasDevice[]) => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await window.agentApi.activate(token);
      if (!result.ok) {
        if (result.kind === "invalid_token") {
          setError("Token tidak valid — generate ulang token dari halaman Settings web Slizebiz.");
        } else if (result.kind === "entitlement_expired") {
          setError("Akses Pro kamu sudah berakhir — perbarui langganan buat lanjut monitoring.");
        } else {
          setError("Gagal konek ke server Slizebiz. Cek koneksi internet, lalu coba lagi.");
        }
        return;
      }
      onActivated(result.data);
    } catch (err) {
      // Tanpa catch, IPC yang reject (main process belum siap / handler throw) cuma bikin
      // tombol aktif lagi tanpa pesan apa pun — user tak tahu harus apa. Konsisten dengan
      // pola savePairing() di PairingScreen.
      console.error("[activation] agent:activate gagal", err);
      setError("Gagal menjalankan aktivasi. Tutup lalu buka lagi aplikasinya, kemudian coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AgentShell>
      <h1 className="g-t1 text-lg font-semibold mb-4">Aktivasi Agent</h1>
      <label htmlFor="token-input" className="g-t2 text-sm block mb-1.5">
        Token Agent
      </label>
      <div className="flex gap-2">
        <GlassInput
          id="token-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={submitting}
          className="flex-1"
        />
        <GlassButton onClick={handleSubmit} disabled={submitting}>
          Aktifkan
        </GlassButton>
      </div>
      {error && (
        <p role="alert" className="g-error text-sm mt-3">
          {error}
        </p>
      )}
    </AgentShell>
  );
}
```

- [ ] **Step 3: Jalankan test lagi, pastikan tetap lolos TANPA modifikasi assertion**

Run: `cd apps/agent && npx vitest run src/renderer/screens/ActivationScreen.test.tsx`
Expected: PASS (4/4), sama seperti Step 1 — file test TIDAK disentuh sama sekali.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/renderer/screens/ActivationScreen.tsx
git commit -m "style(agent): restyle ActivationScreen pakai Glass UI"
```

---

### Task 3: Restyle `PairingScreen`

**Files:**
- Modify: `apps/agent/src/renderer/screens/PairingScreen.tsx`

**Interfaces:**
- Consumes: `AgentShell` (Task 1), `GlassButton`/`GlassCard`/`GlassInput` dari `@3pb/ui`.

**Tidak ada perubahan logic** — semua fungsi (`handleScan`, `startPairing`, `startManualPairing`, `savePairing`), state, dan TEKS setiap tombol/label (persis, karena test query berdasarkan teks: "Scan LAN"/"Memindai...", "Pasangkan ke {label}", "Isi manual", "Terpasang ✓", "Lanjut ke Dashboard", "Simpan Pairing") tetap identik. Hanya JSX return yang berubah.

**Catatan styling:** `@3pb/ui` cuma py`GlassButton` satu varian (ghost) — tidak ada varian "primary" terpisah. Tombol "Lanjut ke Dashboard" (escape hatch, bukan aksi utama) dibedakan secara visual lewat ukuran teks lebih kecil + opacity, BUKAN lewat komponen/varian berbeda (karena memang tak tersedia).

- [ ] **Step 1: Jalankan test existing, konfirmasi baseline hijau**

Run: `cd apps/agent && npx vitest run src/renderer/screens/PairingScreen.test.tsx`
Expected: PASS (12/12).

- [ ] **Step 2: Restyle**

Ganti isi `apps/agent/src/renderer/screens/PairingScreen.tsx` jadi:

```tsx
import { useState } from "react";
import type { SaasDevice } from "../../main/saas-client";
import type { DiscoveredBambuPrinter } from "../../main/discovery/bambu-ssdp";
import type { DiscoveredMoonrakerPrinter } from "../../main/discovery/moonraker-mdns";
import { AgentShell } from "../AgentShell";
import { GlassButton, GlassCard, GlassInput } from "@3pb/ui";

interface PairingTarget {
  shortCode: string;
  ip: string;
  serial: string;
  isManual: boolean;
}

export function PairingScreen({
  devices,
  onAllPaired,
  initialPairedShortCodes = [],
}: {
  devices: SaasDevice[];
  onAllPaired: () => void;
  // Device yang SUDAH dipasangkan di sesi/launch SEBELUMNYA (secret-nya sudah ada di
  // credential-store) — dioper App.tsx dari `agent:get-activation-state` biar user relaunch
  // tak perlu ulang isi access code buat device yang sudah beres (Task 13 review Finding 2).
  initialPairedShortCodes?: string[];
}) {
  const [scanning, setScanning] = useState(false);
  const [bambuPrinters, setBambuPrinters] = useState<DiscoveredBambuPrinter[]>([]);
  const [moonrakerPrinters, setMoonrakerPrinters] = useState<DiscoveredMoonrakerPrinter[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingTarget | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [pairError, setPairError] = useState<string | null>(null);
  // shortCode device yang sudah sukses dipasangkan (sesi ini ATAU launch sebelumnya, lewat
  // initialPairedShortCodes) — dipakai supaya onAllPaired() hanya terpanggil sekali SEMUA
  // device terdaftar sudah dipasangkan (bukan setelah device pertama, lihat Task 12 review
  // gap B1).
  const [pairedCodes, setPairedCodes] = useState<Set<string>>(() => new Set(initialPairedShortCodes));

  async function handleScan() {
    setScanning(true);
    setScanError(null);
    try {
      const result = await window.agentApi.scanLan();
      if (result.bambu.ok) {
        setBambuPrinters(result.bambu.printers);
      } else {
        setBambuPrinters([]);
        setScanError("Port SSDP Bambu sedang dipakai — tutup BambuStudio dan coba lagi.");
      }
      setMoonrakerPrinters(result.moonraker);
    } finally {
      setScanning(false);
    }
  }

  function startPairing(shortCode: string, ip: string, serial: string) {
    // accessCode SENGAJA tidak pernah di-prefill dari hasil scan (tidak ada di paket SSDP
    // maupun mDNS) — user selalu wajib mengetik manual sesuai desain keamanan spec.
    setPairing({ shortCode, ip, serial, isManual: false });
    setAccessCode("");
  }

  function startManualPairing(shortCode: string) {
    setPairing({ shortCode, ip: "", serial: "", isManual: true });
    setAccessCode("");
  }

  async function savePairing() {
    if (!pairing) return;
    setPairError(null);
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

  const unpairedDevices = devices.filter((d) => !pairedCodes.has(d.shortCode));

  return (
    <AgentShell>
      <div className="mb-4 flex justify-end">
        {/* Selalu tampil (bukan cuma pas devices kosong) -- user bisa lanjut ke dashboard
            kapan saja, baik dia belum sempat pairing device manapun (akun 0-device, Task 13
            review Finding 3) maupun sengaja mau pairing sisanya belakangan. Dibuat visual
            lebih kecil/redup dari tombol lain (bukan komponen "secondary" terpisah -- @3pb/ui
            cuma py satu varian GlassButton) biar tidak terlihat seperti aksi utama. */}
        <GlassButton onClick={onAllPaired} className="text-xs opacity-70">
          Lanjut ke Dashboard
        </GlassButton>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <h3 className="g-t2 text-xs font-semibold uppercase tracking-wide mb-2">Device Terdaftar</h3>
          <div className="space-y-2 mb-3">
            {devices.map((d) => {
              const isPaired = pairedCodes.has(d.shortCode);
              return (
                <GlassCard key={d.shortCode} className="p-3 flex items-center justify-between">
                  <span className="g-t1 text-sm">{d.label}</span>
                  {isPaired ? (
                    <span className="g-success text-sm">Terpasang ✓</span>
                  ) : (
                    <GlassButton onClick={() => startManualPairing(d.shortCode)} className="text-xs">
                      Isi manual
                    </GlassButton>
                  )}
                </GlassCard>
              );
            })}
          </div>
          <GlassButton onClick={handleScan} disabled={scanning}>
            {scanning ? "Memindai..." : "Scan LAN"}
          </GlassButton>
          {scanError && (
            <p role="alert" className="g-warning text-sm mt-2">
              {scanError}
            </p>
          )}
        </div>
        <div className="flex-1">
          <h3 className="g-t2 text-xs font-semibold uppercase tracking-wide mb-2">Hasil Scan Bambu</h3>
          <div className="space-y-2">
            {bambuPrinters.map((p) => (
              <GlassCard key={p.serial} className="p-3">
                <span className="g-t1 text-sm">
                  {p.ip} ({p.name})
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {unpairedDevices.map((d) => (
                    <GlassButton
                      key={d.shortCode}
                      onClick={() => startPairing(d.shortCode, p.ip, p.serial)}
                      className="text-xs"
                    >
                      Pasangkan ke {d.label}
                    </GlassButton>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <h3 className="g-t2 text-xs font-semibold uppercase tracking-wide mb-2">Hasil Scan Moonraker</h3>
          <div className="space-y-2">
            {moonrakerPrinters.map((p) => (
              <GlassCard key={p.ip} className="p-3">
                <span className="g-t1 text-sm">
                  {p.ip} ({p.name})
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {unpairedDevices.map((d) => (
                    // Moonraker (Klipper) tak punya konsep serial/access-code seperti Bambu — connector-nya
                    // (packages/printer-monitor-core/src/connectors/moonraker.ts) cuma pakai `device.ip`,
                    // jadi serial dikirim kosong; `accessCode` tetap diminta manual di form pairing yang sama
                    // demi konsistensi bentuk DeviceSecret (Task 2), meski Moonraker tak memvalidasinya.
                    <GlassButton
                      key={d.shortCode}
                      onClick={() => startPairing(d.shortCode, p.ip, "")}
                      className="text-xs"
                    >
                      Pasangkan ke {d.label}
                    </GlassButton>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </div>
      {pairing && (
        <GlassCard className="p-4 mt-4 max-w-sm">
          {pairing.isManual && (
            <>
              <label htmlFor="manual-ip" className="g-t2 text-sm block mb-1">
                IP
              </label>
              <GlassInput
                id="manual-ip"
                value={pairing.ip}
                onChange={(e) => setPairing({ ...pairing, ip: e.target.value })}
                className="w-full mb-2"
              />
              <label htmlFor="manual-serial" className="g-t2 text-sm block mb-1">
                Serial
              </label>
              <GlassInput
                id="manual-serial"
                value={pairing.serial}
                onChange={(e) => setPairing({ ...pairing, serial: e.target.value })}
                className="w-full mb-2"
              />
            </>
          )}
          <label htmlFor="access-code" className="g-t2 text-sm block mb-1">
            Access Code
          </label>
          <GlassInput
            id="access-code"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            className="w-full mb-3"
          />
          <GlassButton onClick={savePairing}>Simpan Pairing</GlassButton>
          {pairError && (
            <p role="alert" className="g-error text-sm mt-2">
              {pairError}
            </p>
          )}
        </GlassCard>
      )}
    </AgentShell>
  );
}
```

- [ ] **Step 3: Jalankan test lagi, pastikan tetap lolos TANPA modifikasi assertion**

Run: `cd apps/agent && npx vitest run src/renderer/screens/PairingScreen.test.tsx`
Expected: PASS (12/12), sama seperti Step 1.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/renderer/screens/PairingScreen.tsx
git commit -m "style(agent): restyle PairingScreen pakai Glass UI"
```

---

### Task 4: Restyle `DashboardScreen`

**Files:**
- Modify: `apps/agent/src/renderer/screens/DashboardScreen.tsx`

**Interfaces:**
- Consumes: `AgentShell` (Task 1), `GlassButton`/`GlassCard` dari `@3pb/ui`.
- Produces: `statusColorClass(state: string): string` — helper internal file ini, memetakan state printer ke class warna (`running`→`g-success`, `idle`/`paused`→`g-info`, `error`→`g-error`, lainnya→`g-t4` redup).

**Tidak ada perubahan logic** — `handleSync()`, `syncErrorMessage()`, polling `useEffect`, dan SEMUA teks (termasuk "Sync"/"Sync...", "Tersinkron (N device)", pesan broker, pesan error per-kind) tetap identik.

- [ ] **Step 1: Jalankan test existing, konfirmasi baseline hijau**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: PASS (10/10).

- [ ] **Step 2: Restyle**

Ganti isi `apps/agent/src/renderer/screens/DashboardScreen.tsx` jadi:

```tsx
import { useEffect, useRef, useState } from "react";
import type { PrintersPayload } from "@3pb/printer-monitor-core";
import type { SyncResult } from "../../main/ipc";
import { AgentShell } from "../AgentShell";
import { GlassButton, GlassCard } from "@3pb/ui";

type SyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "success"; deviceCount: number }
  | { kind: "error"; message: string };

function syncErrorMessage(kind: Extract<SyncResult, { ok: false }>["kind"]): string {
  switch (kind) {
    case "invalid_token":
      return "Token tidak valid — aktivasi ulang dari halaman Settings web Slizebiz.";
    case "entitlement_expired":
      return "Akses Pro sudah berakhir — perbarui langganan buat Sync lagi.";
    case "engine_error":
      return "Gagal konek ulang ke printer — cek IP/access code device yang baru diubah.";
    case "broker_unavailable":
      return "Broker MQTT lokal belum jalan (lihat pesan di bawah) — tak ada device yang bisa dimonitor sampai itu diperbaiki.";
    case "network_error":
    default:
      return "Gagal konek ke server Slizebiz — device tetap jalan dari data lokal terakhir.";
  }
}

// Pemetaan state printer -> warna status (skill glass-ui-theme §Status Colors). Kasus tak
// dikenal (state baru dari firmware/printer yang belum dipetakan) sengaja jatuh ke g-t4
// (redup netral), bukan warna status apa pun -- lebih aman daripada menyiratkan makna salah.
function statusColorClass(state: string): string {
  switch (state.toLowerCase()) {
    case "running":
      return "g-success";
    case "idle":
    case "paused":
      return "g-info";
    case "error":
      return "g-error";
    default:
      return "g-t4";
  }
}

/**
 * `initialSync` = layar ini dibuka LANGSUNG setelah pairing pertama selesai. Saat itu main
 * process belum punya Engine (bootstrap() sudah lewat sebelum device dipasangkan), jadi
 * `agent:get-snapshot` balik `{payload: []}` dan CYD belum pernah dapat layout. Tanpa sync
 * otomatis di sini, satu-satunya jalan keluar buat user adalah menebak tombol Sync atau
 * restart app.
 */
export function DashboardScreen({ initialSync = false }: { initialSync?: boolean } = {}) {
  const [snapshot, setSnapshot] = useState<PrintersPayload>({ payload: [] });
  const [brokerInfo, setBrokerInfo] = useState<{ ip: string; port: number | null } | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });
  const initialSyncStarted = useRef(false);

  useEffect(() => {
    if (!initialSync || initialSyncStarted.current) return;
    initialSyncStarted.current = true; // StrictMode/remount tak boleh memicu sync dobel
    void handleSync();
  }, [initialSync]);

  useEffect(() => {
    const load = () => {
      window.agentApi
        .getSnapshot()
        .then(setSnapshot)
        .catch((err) => console.error("[dashboard] gagal ambil snapshot printer", err));
      // IP broker ikut di-refresh tiap poll (bukan cuma sekali saat mount) -- alamatnya bisa
      // berubah lewat DHCP re-lease, jadi info yang ditampilkan harus tetap akurat.
      window.agentApi
        .getBrokerInfo()
        .then(setBrokerInfo)
        .catch((err) => console.error("[dashboard] gagal ambil info broker", err));
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleSync() {
    setSyncStatus({ kind: "syncing" });
    try {
      const result = await window.agentApi.sync();
      if (result.ok) {
        setSyncStatus({ kind: "success", deviceCount: result.deviceCount });
      } else {
        setSyncStatus({ kind: "error", message: syncErrorMessage(result.kind) });
      }
    } catch (err) {
      console.error("[dashboard] sync gagal", err);
      setSyncStatus({ kind: "error", message: "Sync gagal — cek koneksi lalu coba lagi." });
    }
  }

  return (
    <AgentShell>
      <h1 className="g-t1 text-lg font-semibold mb-4">Dashboard</h1>
      <div className="mb-3 flex items-center gap-3">
        <GlassButton onClick={handleSync} disabled={syncStatus.kind === "syncing"}>
          {syncStatus.kind === "syncing" ? "Sync..." : "Sync"}
        </GlassButton>
        {syncStatus.kind === "success" && (
          <span className="g-success text-sm">Tersinkron ({syncStatus.deviceCount} device)</span>
        )}
      </div>
      {syncStatus.kind === "error" && (
        <p role="alert" className="g-error text-sm mb-3">
          {syncStatus.message}
        </p>
      )}
      {initialSync && syncStatus.kind === "syncing" && (
        <p role="status" className="g-t3 text-sm mb-3">
          Menyiapkan monitoring printer yang baru dipasangkan...
        </p>
      )}
      {brokerInfo && (
        <GlassCard className="p-3 mb-4">
          <p className="g-t2 text-sm">
            Alamat broker (ketik ini di setup WiFi CYD):{" "}
            {brokerInfo.port !== null
              ? `${brokerInfo.ip}:${brokerInfo.port}`
              : "broker belum jalan (port 1883 dipakai proses lain, atau diblokir sistem — cek log aplikasi)"}
          </p>
        </GlassCard>
      )}
      <div className="space-y-2">
        {snapshot.payload.map((p) => (
          <GlassCard key={p.id} className="p-3 flex items-center justify-between">
            <span className="g-t1 text-sm">{p.name}</span>
            <span className={`text-sm ${statusColorClass(p.state)}`}>
              {p.state} — {p.progress}%
            </span>
          </GlassCard>
        ))}
      </div>
    </AgentShell>
  );
}
```

- [ ] **Step 3: Jalankan test lagi, pastikan tetap lolos TANPA modifikasi assertion**

Run: `cd apps/agent && npx vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: PASS (10/10), sama seperti Step 1.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/renderer/screens/DashboardScreen.tsx
git commit -m "style(agent): restyle DashboardScreen pakai Glass UI + warna status printer"
```

---

### Task 5: Verifikasi akhir

**Files:** Tidak ada file baru — task ini murni verifikasi menyeluruh + (kalau ada temuan) perbaikan kecil di file Task 1-4.

**Interfaces:** Tidak ada — task terakhir, tak ada task lain yang bergantung padanya.

- [ ] **Step 1: Full suite `apps/agent`**

Run: `cd apps/agent && npx vitest run`
Expected: SEMUA lulus (baseline sebelum sub-proyek ini: 102 test — pastikan angkanya tidak turun; boleh naik kalau Task 1 menambah `AgentShell.test.tsx`).

- [ ] **Step 2: Typecheck**

Run: `cd apps/agent && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0, tanpa error baru (baseline sebelumnya: 0 error setelah Task 14 sub-proyek 2 — kalau restyle ini menambah error, itu harus diperbaiki di sini, bukan dibiarkan).

- [ ] **Step 3: Build production**

Run: `cd apps/agent && rm -rf out && npx electron-vite build`
Expected: exit 0, `out/renderer` berisi CSS Tailwind yang ter-generate (ulangi cek Task 1 Step 11 kalau perlu).

- [ ] **Step 4: Regresi monorepo penuh**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis && pnpm turbo test`
Expected: SEMUA package lulus (`@3pb/agent`, `@3pb/saas`, `shopee-dashboard`, `@3pb/ui` — kalau ada test-nya, `packages/*` lain), TANPA regresi di luar `apps/agent` akibat dependency baru (`@3pb/ui`, Tailwind).

- [ ] **Step 5: Verifikasi visual manual (WAJIB dilakukan user — Claude tak bisa lihat window Electron)**

Tulis catatan ini di laporan akhir, JANGAN diklaim "selesai" tanpa konfirmasi user:
- [ ] Jalankan `pnpm --filter @3pb/agent dev`, konfirmasi ketiga layar (Aktivasi/Pairing/Dashboard) benar-benar tampil dengan tema Glass UI dark (bukan HTML polos putih seperti sebelumnya).
- [ ] Konfirmasi logo Slizebiz muncul di atas tiap layar.
- [ ] Konfirmasi warna status printer di Dashboard sesuai (hijau=running, dst) kalau ada printer live buat dites.

- [ ] **Step 6: Commit (kalau ada perbaikan dari Step 1-4)**

Kalau semua lulus tanpa perlu perbaikan apa pun, TIDAK ADA commit di task ini. Kalau ada perbaikan kecil (mis. typecheck error), commit spesifik ke file yang diperbaiki dengan pesan yang jelas menyebutkan apa yang diperbaiki.
