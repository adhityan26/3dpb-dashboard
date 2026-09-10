# Slizebiz Agent — Headless Daemon

Daemon Node.js murni (tanpa Electron) untuk Raspberry Pi (arm64) / Linux server, expose
`AgentService` yang sama dipakai app Electron lewat REST API.

## Build

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm install
cd apps/agent-headless
pnpm build   # hasil: dist/index.mjs + dist/build-info.json
```

## Install (Raspberry Pi arm64)

```bash
curl -fsSL https://releases.slizebiz.com/agent-headless/install.sh | bash
```

## Verifikasi manual (WAJIB sebelum dianggap selesai produksi — tidak bisa otomatis dari sesi agent)

1. Deploy ke Raspberry Pi arm64 fisik, jalankan `install.sh`.
2. `curl http://<ip-pi>:8080/healthz` — harus 200, tanpa perlu token.
3. `curl -H "Authorization: Bearer $(cat /var/lib/slizebiz-agent/api-token)" http://<ip-pi>:8080/api/broker-info` — harus 200.
4. `curl http://<ip-pi>:8080/api/broker-info` (tanpa token) — harus 401.
5. `sudo systemctl restart slizebiz-agent` — cek credential/apiToken/brokerPin TIDAK hilang setelah restart (`/api/credential-store-status` harus `{degraded:false}` seperti sebelumnya, token file tetap sama).
6. Model ancaman: HTTP di port 8080 TIDAK terenkripsi (plain HTTP, bukan HTTPS) — dokumentasi ini WAJIB dibaca sebelum expose daemon ke jaringan selain LAN tepercaya.

Langkah tambahan di bawah ini butuh hardware Raspberry Pi fisik dan TIDAK bisa diverifikasi dari sesi agent ini (tidak ada systemd real, tidak ada reboot real di lingkungan pengembangan):

7. Reboot penuh Raspberry Pi (`sudo reboot`) — konfirmasi service `slizebiz-agent` otomatis start lagi setelah boot (systemd `enable` + `WantedBy=multi-user.target`), tanpa intervensi manual.
8. Konfirmasi daemon bind ke interface LAN yang benar (bukan cuma loopback) — akses `http://<ip-pi-di-LAN>:8080/healthz` dari mesin lain di jaringan yang sama.
9. Konfirmasi `Restart=on-failure` benar-benar bekerja: `sudo kill -9 $(pgrep -f dist/index.mjs)` lalu cek service kembali `active (running)` dalam beberapa detik (`systemctl status slizebiz-agent`), tanpa melebihi `StartLimitBurst=5` dalam `StartLimitIntervalSec=300`.
10. Konfirmasi journald benar-benar menangkap stdout/stderr daemon sesuai keputusan desain "journald-only logging" (`NodeLogFileProvider.getLogFilePath()` selalu return null) — `sudo journalctl -u slizebiz-agent -f` harus menampilkan log request/error daemon secara live, tanpa file log terpisah di manapun.

## Yang SUDAH diverifikasi dari sesi agent ini (tanpa hardware)

- Syntax unit file systemd (`apps/agent-headless/install/slizebiz-agent.service`) — via `systemd-analyze verify` kalau tersedia di mesin dev, atau ditelusuri manual kalau tidak (lihat laporan Task 14).
- Syntax shell script (`apps/agent-headless/install/install.sh`) — via `bash -n`.
- Tidak ada eksekusi nyata dari `install.sh` (tidak ada `sudo`, download, atau systemd call yang benar-benar dijalankan) — sesi ini bukan Linux/hardware target.

## Model ancaman v1

- Auth: Bearer token 32-byte (`apiToken`), TERPISAH dari PIN broker MQTT (`brokerPin`, 4 digit, cuma untuk CYD).
- Plain HTTP (tanpa TLS) — asumsi LAN rumah/workshop tepercaya, sama seperti asumsi broker MQTT yang sudah ada.
- Rate limiter berlaku untuk SEMUA alamat termasuk loopback (beda dari broker MQTT).
