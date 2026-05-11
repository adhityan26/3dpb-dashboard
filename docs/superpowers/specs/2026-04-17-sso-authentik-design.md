# SSO dengan Authentik — Design Spec

**Date:** 2026-04-17
**Status:** Approved

---

## Goal

Single Sign-On untuk semua internal tools di homelab. Login sekali di Authentik → semua app langsung bisa diakses tanpa login ulang. Public-facing apps tetap bisa diakses tanpa auth.

---

## Architecture Overview

```
Browser (local/internet)
    ↓
Nginx Proxy Manager — port 80/443
    │
    ├─ Protected app → forward auth check ke Authentik
    │       ├─ Sudah login → teruskan ke app (inject headers: username, email)
    │       └─ Belum login → redirect ke Authentik login page → balik ke app
    │
    └─ Public app → langsung teruskan (bypass auth)
```

**DNS:** Pi-hole (LXC di Proxmox) resolve semua `*.homelab` → `192.168.88.113`. MikroTik DHCP set Pi-hole sebagai primary DNS, `1.1.1.1` sebagai secondary (fallback kalau Pi-hole mati).

---

## Komponen Baru

### 1. Pi-hole (LXC di Proxmox)
- IP dedicated: `192.168.88.5` (atau IP kosong lainnya)
- Setup via Proxmox Community Scripts (tteck)
- Custom DNS entries: semua `*.homelab` → `192.168.88.113`
- MikroTik DHCP: DNS1 = `192.168.88.5`, DNS2 = `1.1.1.1`

### 2. Nginx Proxy Manager (Docker container baru)
- Port 80 dan 443 di server
- UI admin: `npm.homelab`
- Handle routing semua `*.homelab` ke port yang tepat
- Handle forward auth ke Authentik untuk protected apps
- Bypass auth untuk public apps dan specific paths

### 3. Authentik (2 Docker containers)
- `authentik-server` + `authentik-worker`
- PostgreSQL: reuse `light-generator-postgres-1`, database name `authentik`
- Redis: reuse `light-generator-redis-1`
- UI admin: `auth.homelab`
- Catatan: PostgreSQL + Redis akan dimigrasikan ke dedicated instance di session terpisah

---

## App Matrix

| App | Container | Port | Domain Lokal | Domain Publik | Auth |
|---|---|---|---|---|---|
| Authentik | authentik-server | 9000 | `auth.homelab` | — | — |
| NPM | nginx-proxy-manager | 81 (UI) | `npm.homelab` | — | ✅ Protected |
| shopee-dashboard | shopee-dashboard | 3000 | `shopee.homelab` | `dashboard.3dprintingbandung.my.id` | ✅ Protected* |
| dashboard-local | dashboard-local-dashboard-1 | 8888 | `dashboard.homelab` | — | ✅ Protected |
| light-generator | light-generator-web-1 | 3001 | `light.homelab` | — | ✅ Protected |
| stl-cutter | stl-cutter-web-1 | 8981 | `stl.homelab` | — | ✅ Protected |
| customnama | customnama-nametag-1 | 5000 | `custom.homelab` | — | ✅ Protected |
| 3dpb-studio | 3dpb-studio | 3333 | `studio.homelab` | — | ✅ Protected |
| 3dpb-web | 3dpb-web | 4321 | `3dpb.homelab` | `3dpb.com` | ❌ Public |

*shopee-dashboard: bypass auth untuk path `/api/shopee/*` dan `/api/v1/*` (Shopee callback + MrBambuSpoolPal)

---

## Auth Strategy per App

### Apps tanpa auth saat ini → NPM forward auth (zero code changes)
`dashboard-local`, `stl-cutter`, `customnama`, `3dpb-studio`, `light-generator`

NPM cek ke Authentik sebelum forward request. App tidak tahu ada auth — semua transparan.

### shopee-dashboard → NextAuth OAuth ke Authentik
App ini perlu tahu siapa usernya (role: OWNER/ADMIN). Dua langkah:
1. NPM forward auth (block akses sebelum sampai ke app)
2. NextAuth dikonfigurasi pakai Authentik sebagai OAuth provider

User di Authentik harus punya email yang sama dengan user di DB lokal shopee-dashboard. Password dimanage di Authentik, bukan di DB lokal.

### 3dpb-web → bypass total
Public landing page + form order. NPM skip auth check.

---

## Authentik OAuth Provider Setup

Untuk shopee-dashboard, Authentik dikonfigurasi sebagai OAuth2/OIDC provider:

```
Client ID: shopee-dashboard
Redirect URI: https://shopee.homelab/api/auth/callback/authentik
               https://dashboard.3dprintingbandung.my.id/api/auth/callback/authentik
Scopes: openid, email, profile
```

NextAuth config di shopee-dashboard:
```ts
// Ganti Credentials provider dengan:
import Authentik from "next-auth/providers/authentik"

providers: [
  Authentik({
    clientId: process.env.AUTHENTIK_CLIENT_ID,
    clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
    issuer: process.env.AUTHENTIK_ISSUER, // https://auth.homelab/application/o/shopee-dashboard/
  })
]
```

---

## Urutan Setup

1. **Pi-hole LXC** → setup custom DNS `.homelab` → update MikroTik DHCP
2. **NPM container** → expose port 80/443 → test routing basic
3. **Authentik containers** → setup admin, buat user, buat OAuth provider
4. **NPM forward auth** → protect semua internal apps
5. **shopee-dashboard migration** → ganti NextAuth provider → test login via Authentik
6. **Verifikasi** → test semua app dari local dan public

---

## Out of Scope (Session Terpisah)

- Dedicated PostgreSQL dengan pgBackRest backup
- Patroni untuk HA multi-node
- Migrasi data light-generator ke PostgreSQL baru
- Setup 3d-catalog (Synology)
- texteditor (belum selesai)
- Konsolidasi form order ke 3dpb-web

---

## Catatan Penting

- Pi-hole di Proxmox independent dari Docker stack → DNS tetap jalan meski Docker bermasalah
- Kalau Pi-hole mati: internet tetap jalan via `1.1.1.1` fallback, `.homelab` tidak resolve (akses via IP:port masih bisa)
- Authentik di Docker: kalau server mati, semua app juga mati — tidak ada risiko tambahan
- Public apps tetap bisa diakses dari internet tanpa perlu auth sama sekali