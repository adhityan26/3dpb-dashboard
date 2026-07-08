# SSO Authentik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single Sign-On untuk semua internal tools di homelab menggunakan Authentik sebagai IdP, Nginx Proxy Manager sebagai reverse proxy dengan forward auth, dan Pi-hole sebagai local DNS.

**Architecture:** Pi-hole (LXC Proxmox) resolve `*.homelab` → `192.168.88.113`. NPM (Docker) terima semua traffic port 80/443, cek ke Authentik sebelum forward ke app yang dilindungi. shopee-dashboard migrasi dari NextAuth Credentials ke NextAuth OAuth (Authentik). App lain dilindungi sepenuhnya di layer NPM tanpa ubah code.

**Tech Stack:** Proxmox LXC, Pi-hole, Docker Compose, Nginx Proxy Manager, Authentik 2025.x, NextAuth v5 (Auth.js), PostgreSQL 16 (reuse light-generator), Redis 7 (reuse light-generator)

---

## File Structure

| Action | Path | Keterangan |
|---|---|---|
| Create | `/opt/stacks/nginx-proxy-manager/docker-compose.yml` | NPM stack (di server) |
| Create | `/opt/stacks/authentik/docker-compose.yml` | Authentik stack (di server) |
| Create | `/opt/stacks/authentik/.env` | Secrets Authentik (di server, tidak di-commit) |
| Modify | `lib/auth.ts` | Ganti Credentials → Authentik OAuth provider |
| Modify | `.env.deploy` | Tambah AUTHENTIK_* env vars |
| Modify | `deploy.sh` | Tambah env vars baru ke docker run |

---

## Existing Infrastructure Context

- **Docker host:** `192.168.88.113`, akses via `DOCKER_HOST=tcp://192.168.88.113:2375`
- **Postgres:** container `light-generator-postgres-1`, user=`postgres`, password=`postgres`, db=`lightgenerator`, network=`light-generator_default`
- **Redis:** container `light-generator-redis-1`, no auth, network=`light-generator_default`
- **Pi-hole target IP:** `192.168.88.8` (`.5` sudah terpakai)
- **shopee-dashboard:** NextAuth v5, `lib/auth.ts` — Credentials provider dengan bcrypt

---

### Task 1: Pi-hole LXC di Proxmox

**Files:** Tidak ada file code — konfigurasi via Proxmox shell dan Pi-hole web UI.

- [ ] **Step 1: Buka Proxmox shell**

  SSH ke Proxmox host atau buka **Shell** di Proxmox web UI.

- [ ] **Step 2: Jalankan Proxmox community script Pi-hole**

  ```bash
  bash -c "$(wget -qLO - https://github.com/tteck/Proxmox/raw/main/ct/pihole.sh)"
  ```

  Saat diminta:
  - **IP Address:** `192.168.88.8/24`
  - **Gateway:** `192.168.88.1` (sesuaikan dengan gateway MikroTik)
  - **Storage:** local-lvm (atau sesuai setup Proxmox)
  - Sisanya: default

  Tunggu hingga selesai. LXC otomatis start.

- [ ] **Step 3: Verifikasi Pi-hole berjalan**

  Dari browser: `http://192.168.88.8/admin`

  Expected: Pi-hole dashboard muncul. Catat password admin yang ditampilkan di akhir script (atau reset via `pihole -a -p newpassword` di shell LXC).

- [ ] **Step 4: Tambah DNS entries untuk semua domain `.homelab`**

  Di Pi-hole admin UI: **Local DNS → DNS Records**, tambah semua entry berikut (semua point ke `192.168.88.113`):

  | Domain | IP |
  |---|---|
  | `auth.homelab` | `192.168.88.113` |
  | `npm.homelab` | `192.168.88.113` |
  | `shopee.homelab` | `192.168.88.113` |
  | `dashboard.homelab` | `192.168.88.113` |
  | `light.homelab` | `192.168.88.113` |
  | `stl.homelab` | `192.168.88.113` |
  | `custom.homelab` | `192.168.88.113` |
  | `studio.homelab` | `192.168.88.113` |

- [ ] **Step 5: Update MikroTik DHCP untuk pakai Pi-hole**

  Di MikroTik (Winbox atau web UI):
  - **IP → DHCP Server → Networks** → edit network kamu
  - **DNS Servers:** `192.168.88.8, 1.1.1.1`
  - Apply

- [ ] **Step 6: Verifikasi DNS resolve dari laptop**

  ```bash
  # Tunggu DHCP renew atau reconnect WiFi dulu
  nslookup shopee.homelab
  ```

  Expected:
  ```
  Server:   192.168.88.8
  Address:  192.168.88.8#53
  Name:     shopee.homelab
  Address:  192.168.88.113
  ```

- [ ] **Step 7: Commit progress (dokumentasi saja)**

  ```bash
  git commit --allow-empty -m "infra: Pi-hole LXC deployed at 192.168.88.8, DNS *.homelab configured"
  ```

---

### Task 2: Shared Docker Network + Authentik Database

**Files:** Tidak ada file — Docker network dan database setup via CLI.

- [ ] **Step 1: Buat shared Docker network `homelab`**

  ```bash
  DOCKER_HOST=tcp://192.168.88.113:2375 docker network create homelab
  ```

  Expected:
  ```
  <network-id>
  ```

- [ ] **Step 2: Hubungkan postgres dan redis ke network `homelab`**

  ```bash
  DOCKER_HOST=tcp://192.168.88.113:2375 docker network connect homelab light-generator-postgres-1
  DOCKER_HOST=tcp://192.168.88.113:2375 docker network connect homelab light-generator-redis-1
  ```

  Expected: tidak ada output (success silent).

- [ ] **Step 3: Buat database dan user Authentik di postgres**

  ```bash
  DOCKER_HOST=tcp://192.168.88.113:2375 docker exec -i light-generator-postgres-1 psql -U postgres <<EOF
  CREATE DATABASE authentik;
  CREATE USER authentik WITH PASSWORD 'authentik_db_password';
  GRANT ALL PRIVILEGES ON DATABASE authentik TO authentik;
  ALTER DATABASE authentik OWNER TO authentik;
  EOF
  ```

  Expected:
  ```
  CREATE DATABASE
  CREATE ROLE
  GRANT
  ALTER DATABASE
  ```

- [ ] **Step 4: Verifikasi database terbuat**

  ```bash
  DOCKER_HOST=tcp://192.168.88.113:2375 docker exec light-generator-postgres-1 psql -U postgres -c "\l" | grep authentik
  ```

  Expected: baris `authentik | authentik | ...` muncul.

---

### Task 3: Nginx Proxy Manager (NPM)

**Files:**
- Create: `/opt/stacks/nginx-proxy-manager/docker-compose.yml` (di server via SSH atau buat lokal lalu copy)

- [ ] **Step 1: Cek port 80 dan 443 belum dipakai**

  ```bash
  DOCKER_HOST=tcp://192.168.88.113:2375 docker ps --format "{{.Ports}}" | grep -E ":80->|:443->"
  ```

  Expected: tidak ada output (port bebas).

- [ ] **Step 2: Buat direktori dan docker-compose NPM di server**

  SSH ke server (`ssh user@192.168.88.113`) atau via Portainer Stack, buat file:

  ```bash
  mkdir -p /opt/stacks/nginx-proxy-manager
  cat > /opt/stacks/nginx-proxy-manager/docker-compose.yml << 'EOF'
  services:
    npm:
      image: jc21/nginx-proxy-manager:latest
      container_name: nginx-proxy-manager
      restart: unless-stopped
      ports:
        - "80:80"
        - "443:443"
        - "81:81"
      volumes:
        - npm_data:/data
        - npm_letsencrypt:/etc/letsencrypt
      networks:
        - homelab

  volumes:
    npm_data:
    npm_letsencrypt:

  networks:
    homelab:
      external: true
  EOF
  ```

- [ ] **Step 3: Deploy NPM**

  ```bash
  cd /opt/stacks/nginx-proxy-manager
  DOCKER_HOST=tcp://192.168.88.113:2375 docker compose up -d
  ```

  Expected:
  ```
  ✔ Container nginx-proxy-manager  Started
  ```

- [ ] **Step 4: Verifikasi NPM berjalan**

  Buka `http://npm.homelab:81` (atau `http://192.168.88.113:81`)

  Login default: `admin@example.com` / `changeme`

  Langsung diminta ganti password dan email → gunakan email dan password yang kuat.

- [ ] **Step 5: Tambah proxy host dasar (npm.homelab)**

  Di NPM UI → **Proxy Hosts → Add Proxy Host**:
  - Domain: `npm.homelab`
  - Scheme: `http`
  - Forward hostname: `nginx-proxy-manager` (container name)
  - Forward port: `81`
  - Websockets: on

  Save. Test: buka `http://npm.homelab` → harus redirect ke NPM UI.

---

### Task 4: Authentik Docker Stack

**Files:**
- Create: `/opt/stacks/authentik/docker-compose.yml`
- Create: `/opt/stacks/authentik/.env`

- [ ] **Step 1: Generate Authentik secret key**

  ```bash
  openssl rand -base64 50
  ```

  Simpan output-nya — ini `AUTHENTIK_SECRET_KEY`.

- [ ] **Step 2: Buat direktori dan .env file**

  ```bash
  mkdir -p /opt/stacks/authentik
  cat > /opt/stacks/authentik/.env << 'EOF'
  AUTHENTIK_SECRET_KEY=<output dari step 1>
  AUTHENTIK_DB_PASSWORD=authentik_db_password
  AUTHENTIK_TAG=2025.4
  EOF
  ```

  Ganti `<output dari step 1>` dengan hasil `openssl rand` di atas.
  Cek versi terbaru Authentik di: https://github.com/goauthentik/authentik/releases

- [ ] **Step 3: Buat docker-compose.yml Authentik**

  ```bash
  cat > /opt/stacks/authentik/docker-compose.yml << 'EOF'
  services:
    server:
      image: ghcr.io/goauthentik/server:${AUTHENTIK_TAG}
      container_name: authentik-server
      command: server
      restart: unless-stopped
      environment:
        AUTHENTIK_REDIS__HOST: light-generator-redis-1
        AUTHENTIK_POSTGRESQL__HOST: light-generator-postgres-1
        AUTHENTIK_POSTGRESQL__USER: authentik
        AUTHENTIK_POSTGRESQL__NAME: authentik
        AUTHENTIK_POSTGRESQL__PASSWORD: ${AUTHENTIK_DB_PASSWORD}
        AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY}
        AUTHENTIK_ERROR_REPORTING__ENABLED: "false"
      ports:
        - "9000:9000"
      networks:
        - homelab
      volumes:
        - authentik_media:/media
        - authentik_templates:/templates

    worker:
      image: ghcr.io/goauthentik/server:${AUTHENTIK_TAG}
      container_name: authentik-worker
      command: worker
      restart: unless-stopped
      environment:
        AUTHENTIK_REDIS__HOST: light-generator-redis-1
        AUTHENTIK_POSTGRESQL__HOST: light-generator-postgres-1
        AUTHENTIK_POSTGRESQL__USER: authentik
        AUTHENTIK_POSTGRESQL__NAME: authentik
        AUTHENTIK_POSTGRESQL__PASSWORD: ${AUTHENTIK_DB_PASSWORD}
        AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY}
        AUTHENTIK_ERROR_REPORTING__ENABLED: "false"
      networks:
        - homelab
      volumes:
        - authentik_media:/media
        - authentik_templates:/templates

  volumes:
    authentik_media:
    authentik_templates:

  networks:
    homelab:
      external: true
  EOF
  ```

- [ ] **Step 4: Deploy Authentik**

  ```bash
  cd /opt/stacks/authentik
  DOCKER_HOST=tcp://192.168.88.113:2375 docker compose up -d
  ```

  Tunggu ~30 detik untuk inisialisasi pertama.

- [ ] **Step 5: Verifikasi Authentik berjalan**

  ```bash
  DOCKER_HOST=tcp://192.168.88.113:2375 docker logs authentik-server --tail 20
  ```

  Expected: log menunjukkan `Starting authentik server` tanpa error koneksi database.

- [ ] **Step 6: Setup wizard Authentik**

  Buka `http://192.168.88.113:9000/if/flow/initial-setup/`

  Set email dan password untuk akun admin Authentik.

- [ ] **Step 7: Tambah proxy host Authentik di NPM**

  Di NPM → Proxy Hosts → Add:
  - Domain: `auth.homelab`
  - Forward hostname: `authentik-server`
  - Forward port: `9000`
  - Websockets: on

  Verifikasi: `http://auth.homelab` → halaman Authentik muncul.

---

### Task 5: Konfigurasi Authentik — Users dan OAuth Provider

**Files:** Tidak ada file — konfigurasi via Authentik web UI.

- [ ] **Step 1: Buat user di Authentik**

  Login ke `http://auth.homelab` sebagai admin.

  **Admin Interface → Directory → Users → Create**:
  - Username: (nama kamu)
  - Email: `owner@3dprintingbandung.com` ← **harus sama persis dengan email di shopee-dashboard DB**
  - Name: Owner
  - Password: set password baru

  Repeat untuk user lain yang butuh akses (jika ada).

- [ ] **Step 2: Buat OAuth2/OIDC Provider untuk shopee-dashboard**

  **Admin Interface → Applications → Providers → Create**:
  - Type: **OAuth2/OpenID Provider**
  - Name: `shopee-dashboard`
  - Authorization flow: `default-provider-authorization-implicit-consent`
  - Client type: `Confidential`
  - Client ID: **catat ini** (auto-generated atau set manual: `shopee-dashboard`)
  - Client Secret: **catat ini** (auto-generated)
  - Redirect URIs:
    ```
    http://shopee.homelab/api/auth/callback/authentik
    https://dashboard.3dprintingbandung.my.id/api/auth/callback/authentik
    ```
  - Scopes: `openid`, `email`, `profile`

  Save. **Catat Client ID dan Client Secret** — dibutuhkan di Task 7.

- [ ] **Step 3: Buat Application untuk shopee-dashboard**

  **Admin Interface → Applications → Applications → Create**:
  - Name: `Shopee Dashboard`
  - Slug: `shopee-dashboard`
  - Provider: pilih `shopee-dashboard` yang dibuat di Step 2

  Save.

- [ ] **Step 4: Catat Issuer URL**

  Di detail provider `shopee-dashboard`, lihat **OpenID Configuration URL**.

  Format: `http://auth.homelab/application/o/shopee-dashboard/`

  Ini nilai `AUTHENTIK_ISSUER` yang dibutuhkan di Task 7.

- [ ] **Step 5: Buat Outpost untuk forward auth**

  **Admin Interface → Applications → Outposts → Create**:
  - Name: `homelab-proxy`
  - Type: **Proxy**
  - Applications: tambahkan semua app yang akan dilindungi (bisa tambah nanti)

  **Integration: Docker** → pilih `Local Docker connection`

  Save. Authentik otomatis deploy container `authentik-proxy` ke Docker host.

  Verifikasi:
  ```bash
  DOCKER_HOST=tcp://192.168.88.113:2375 docker ps | grep authentik-proxy
  ```

  Expected: container `authentik-proxy` atau serupa running.

---

### Task 6: NPM Forward Auth untuk Semua Apps

**Files:** Tidak ada file — konfigurasi via NPM web UI.

Untuk setiap **protected app**, tambah proxy host dengan forward auth ke Authentik.

- [ ] **Step 1: Tambah proxy host `dashboard.homelab` (dashboard-local)**

  Di NPM → Proxy Hosts → Add:
  - Domain: `dashboard.homelab`
  - Forward hostname: `dashboard-local-dashboard-1`
  - Forward port: `3000`
  - Websockets: on

  Tab **Advanced** → tambah config Nginx:
  ```nginx
  location /outpost.goauthentik.io {
      proxy_pass http://authentik-server:9000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
  }

  auth_request /outpost.goauthentik.io/auth/nginx;
  error_page 401 = @goauthentik_proxy_signin;
  auth_request_set $auth_cookie $upstream_http_set_cookie;
  add_header Set-Cookie $auth_cookie;
  auth_request_set $authentik_username $upstream_http_x_authentik_username;
  auth_request_set $authentik_groups $upstream_http_x_authentik_groups;
  add_header X-authentik-username $authentik_username;
  add_header X-authentik-groups $authentik_groups;

  location @goauthentik_proxy_signin {
      internal;
      add_header Set-Cookie $auth_cookie;
      return 302 /outpost.goauthentik.io/start?rd=$request_uri;
  }
  ```

- [ ] **Step 2: Tambah proxy host untuk semua protected apps**

  Ulangi Step 1 untuk:

  | Domain | Container | Port |
  |---|---|---|
  | `light.homelab` | `light-generator-web-1` | `3000` |
  | `stl.homelab` | `stl-cutter-web-1` | `80` |
  | `custom.homelab` | `customnama-nametag-1` | `5000` |
  | `studio.homelab` | `3dpb-studio` | `80` |

  Semua pakai Advanced config forward auth yang sama seperti Step 1.

- [ ] **Step 3: Tambah proxy host untuk public apps (bypass auth)**

  **`3dpb.homelab` dan `3dprintingbandung.my.id`** — TANPA advanced config forward auth:
  - Domain: `3dprintingbandung.my.id`
  - Forward hostname: `3dpb-web`
  - Forward port: `4321`
  - Tidak ada auth_request

  Sama untuk `light.3dprintingbandung.my.id` → `light-generator-web-1:3000` (customer order form, bypass auth).

- [ ] **Step 4: Test forward auth**

  Buka `http://dashboard.homelab` di browser incognito.

  Expected: redirect ke `http://auth.homelab/if/flow/...` (halaman login Authentik).

  Login dengan user yang dibuat di Task 5 Step 1.

  Expected: setelah login, redirect kembali ke `http://dashboard.homelab` dan langsung masuk.

- [ ] **Step 5: Verifikasi SSO**

  Buka `http://light.homelab` di tab baru (masih browser yang sama).

  Expected: langsung masuk **tanpa login lagi** (SSO bekerja).

---

### Task 7: shopee-dashboard — Migrasi NextAuth ke Authentik OAuth

**Files:**
- Modify: `lib/auth.ts`
- Modify: `.env.deploy`
- Modify: `deploy.sh`

- [ ] **Step 1: Tambah AUTHENTIK_* env vars ke `.env.deploy`**

  Edit `.env.deploy` di root shopee-dashboard, tambah:
  ```bash
  AUTHENTIK_CLIENT_ID=shopee-dashboard
  AUTHENTIK_CLIENT_SECRET=<client secret dari Task 5 Step 2>
  AUTHENTIK_ISSUER=http://auth.homelab/application/o/shopee-dashboard/
  ```

- [ ] **Step 2: Tulis test untuk auth behavior baru**

  Buat file `lib/__tests__/auth-config.test.ts`:

  ```ts
  import { describe, it, expect, vi } from "vitest"

  // Test bahwa auth config export handlers yang diperlukan
  describe("auth config", () => {
    it("should export handlers, signIn, signOut, auth", async () => {
      // Mock next-auth sebelum import
      vi.mock("next-auth", () => ({
        default: vi.fn().mockReturnValue({
          handlers: { GET: vi.fn(), POST: vi.fn() },
          signIn: vi.fn(),
          signOut: vi.fn(),
          auth: vi.fn(),
        }),
      }))
      vi.mock("next-auth/providers/authentik", () => ({
        default: vi.fn().mockReturnValue({ id: "authentik" }),
      }))
      vi.mock("@/lib/db", () => ({
        prisma: { user: { findUnique: vi.fn() } },
      }))

      const { handlers, signIn, signOut, auth } = await import("@/lib/auth")
      expect(handlers).toBeDefined()
      expect(signIn).toBeDefined()
      expect(signOut).toBeDefined()
      expect(auth).toBeDefined()
    })
  })
  ```

- [ ] **Step 3: Jalankan test untuk verifikasi setup (akan pass karena mock)**

  ```bash
  npm test lib/__tests__/auth-config.test.ts
  ```

  Expected: PASS (test ini verifikasi export saja).

- [ ] **Step 4: Update `lib/auth.ts` — ganti Credentials dengan Authentik OAuth**

  Ganti seluruh isi `lib/auth.ts` dengan:

  ```ts
  import NextAuth from "next-auth"
  import Authentik from "next-auth/providers/authentik"
  import { prisma } from "@/lib/db"

  export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
      Authentik({
        clientId: process.env.AUTHENTIK_CLIENT_ID!,
        clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
        issuer: process.env.AUTHENTIK_ISSUER!,
      }),
    ],
    callbacks: {
      async signIn({ user }) {
        // Hanya izinkan user yang terdaftar di DB lokal
        if (!user.email) return false
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
        })
        return !!dbUser
      },
      async jwt({ token, user }) {
        // Saat pertama login, ambil role dari DB lokal
        if (user?.email) {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true, role: true },
          })
          if (dbUser) {
            token.role = dbUser.role
            token.id = dbUser.id
          }
        }
        return token
      },
      session({ session, token }) {
        if (session.user) {
          session.user.role = token.role as string
          session.user.id = token.id as string
        }
        return session
      },
    },
    pages: {
      signIn: "/login",
    },
  })
  ```

- [ ] **Step 5: Update `deploy.sh` — tambah env vars Authentik**

  Di `deploy.sh`, tambah tiga baris `-e` di blok `docker run`:
  ```bash
  -e AUTHENTIK_CLIENT_ID="$AUTHENTIK_CLIENT_ID" \
  -e AUTHENTIK_CLIENT_SECRET="$AUTHENTIK_CLIENT_SECRET" \
  -e AUTHENTIK_ISSUER="$AUTHENTIK_ISSUER" \
  ```

  Dan tambah ke `REQUIRED_VARS` array:
  ```bash
  REQUIRED_VARS=(
    DATABASE_URL NEXTAUTH_URL NEXTAUTH_SECRET
    SHOPEE_PARTNER_ID SHOPEE_PARTNER_KEY SHOPEE_SHOP_ID
    INTERNAL_NOTIFICATION_SECRET
    AUTHENTIK_CLIENT_ID AUTHENTIK_CLIENT_SECRET AUTHENTIK_ISSUER
  )
  ```

- [ ] **Step 6: Jalankan test suite**

  ```bash
  npm test
  ```

  Expected: semua test pass (atau `--passWithNoTests` kalau tidak ada test lain yang affected).

- [ ] **Step 7: Build dan deploy shopee-dashboard**

  ```bash
  ./deploy.sh build
  ```

  Expected: build berhasil, container restart.

- [ ] **Step 8: Tambah proxy host shopee-dashboard di NPM dengan bypass untuk API paths**

  Di NPM → Proxy Hosts → Add:
  - Domain: `shopee.homelab`
  - Forward hostname: `shopee-dashboard`
  - Forward port: `3000`

  Tab **Advanced**:
  ```nginx
  # Bypass auth untuk Shopee API callbacks dan Spoolman API
  location ~ ^/(api/shopee|api/v1) {
      proxy_pass http://shopee-dashboard:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
  }

  # NextAuth callbacks harus bypass juga
  location /api/auth {
      proxy_pass http://shopee-dashboard:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
  }

  # Semua route lain: cek Authentik
  location /outpost.goauthentik.io {
      proxy_pass http://authentik-server:9000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
  }

  auth_request /outpost.goauthentik.io/auth/nginx;
  error_page 401 = @goauthentik_proxy_signin;
  auth_request_set $auth_cookie $upstream_http_set_cookie;
  add_header Set-Cookie $auth_cookie;

  location @goauthentik_proxy_signin {
      internal;
      add_header Set-Cookie $auth_cookie;
      return 302 /outpost.goauthentik.io/start?rd=$request_uri;
  }
  ```

- [ ] **Step 9: Commit semua perubahan**

  ```bash
  git add lib/auth.ts lib/__tests__/auth-config.test.ts deploy.sh
  git commit -m "feat: migrate shopee-dashboard auth to Authentik OAuth SSO"
  git push
  ```

---

### Task 8: End-to-End Verification

**Files:** Tidak ada perubahan — verifikasi saja.

- [ ] **Step 1: Test SSO login flow**

  Buka `http://shopee.homelab` di browser incognito.

  Expected:
  1. Redirect ke `http://auth.homelab` (Authentik login)
  2. Login dengan credentials Authentik
  3. Redirect balik ke `http://shopee.homelab`
  4. Dashboard shopee muncul dengan role OWNER

- [ ] **Step 2: Test SSO across apps (login sekali, akses semua)**

  Di browser yang sudah login (Step 1), buka tab baru:
  - `http://dashboard.homelab` → langsung masuk ✅
  - `http://stl.homelab` → langsung masuk ✅
  - `http://light.homelab` → langsung masuk ✅

- [ ] **Step 3: Test public apps bypass auth**

  Di browser incognito baru (belum login):
  - `http://3dprintingbandung.my.id` → landing page muncul **tanpa redirect ke login** ✅

- [ ] **Step 4: Test Shopee API callback bypass**

  ```bash
  curl -I http://shopee.homelab/api/shopee/auth
  ```

  Expected: response `200` atau `302` ke Shopee (bukan `401` atau redirect ke Authentik).

- [ ] **Step 5: Test akses dari public domain**

  Dari luar jaringan (atau via phone data, bukan WiFi):
  - `https://dashboard.3dprintingbandung.my.id` → redirect ke Authentik login → login → masuk dashboard ✅

- [ ] **Step 6: Test logout**

  Di shopee-dashboard, klik logout.

  Expected: redirect ke Authentik logout, session Authentik juga terminate. Buka `http://dashboard.homelab` → redirect ke login Authentik (session benar-benar habis).

---

## Catatan Penting

- **Urutan wajib:** Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Jangan skip.
- **Postgres password:** `postgres` (default light-generator). Jangan expose port 5432 ke internet.
- **Redis:** tidak ada password — hanya accessible via Docker network internal, aman.
- **Rollback shopee-dashboard:** kalau ada masalah di Task 7, revert `lib/auth.ts` ke Credentials provider dan redeploy. Data user di DB tidak terpengaruh.
- **Session lama:** user yang sedang login saat deploy Task 7 akan di-logout otomatis (session invalidated). Normal.
