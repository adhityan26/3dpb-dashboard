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
    <AgentShell maxWidth="max-w-3xl">
      <h1 className="g-t1 text-lg font-semibold mb-4">Pairing Device</h1>
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
