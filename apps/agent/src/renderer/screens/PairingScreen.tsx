import { useState } from "react";
import type { SaasDevice } from "../../main/saas-client";
import type { DiscoveredBambuPrinter } from "../../main/discovery/bambu-ssdp";
import type { DiscoveredMoonrakerPrinter } from "../../main/discovery/moonraker-mdns";
import { suggestModelFromSsdp } from "../../main/printer-model";

interface PairingTarget {
  shortCode: string;
  ip: string;
  serial: string;
  model: string;
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
  const [modelWarning, setModelWarning] = useState<string | null>(null);
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

  function startPairing(shortCode: string, ip: string, serial: string, suggestedModel: string) {
    // accessCode SENGAJA tidak pernah di-prefill dari hasil scan (tidak ada di paket SSDP
    // maupun mDNS) — user selalu wajib mengetik manual sesuai desain keamanan spec.
    setPairing({ shortCode, ip, serial, model: suggestedModel, isManual: false });
    setAccessCode("");
  }

  function startManualPairing(shortCode: string) {
    setPairing({ shortCode, ip: "", serial: "", model: "", isManual: true });
    setAccessCode("");
  }

  async function savePairing() {
    if (!pairing) return;
    setPairError(null);
    setModelWarning(null);
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

    // Model diusulkan balik ke SaaS best-effort SETELAH secret lokal tersimpan -- kegagalan di
    // sini TIDAK membatalkan pairing (secret sudah aman), cuma tampil sebagai peringatan ringan
    // (spec §6). Device di SaaS yang model-nya sudah sama tak perlu di-PATCH ulang.
    const modelTrimmed = pairing.model.trim();
    const currentDevice = devices.find((d) => d.shortCode === pairing.shortCode);
    if (modelTrimmed && modelTrimmed !== (currentDevice?.model ?? "")) {
      const result = await window.agentApi.updateDeviceModel(pairing.shortCode, modelTrimmed);
      if (!result.ok) setModelWarning("Model belum tersimpan ke akun — bisa diisi lewat web.");
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
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        {/* Selalu tampil (bukan cuma pas devices kosong) -- user bisa lanjut ke dashboard
            kapan saja, baik dia belum sempat pairing device manapun (akun 0-device, Task 13
            review Finding 3) maupun sengaja mau pairing sisanya belakangan. */}
        <button onClick={onAllPaired}>Lanjut ke Dashboard</button>
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        <div>
          <h3>Device Terdaftar</h3>
          {devices.map((d) => {
            const isPaired = pairedCodes.has(d.shortCode);
            return (
              <div key={d.shortCode}>
                <span>{d.label}</span>
                {isPaired ? (
                  <span> Terpasang ✓</span>
                ) : (
                  <button onClick={() => startManualPairing(d.shortCode)}>Isi manual</button>
                )}
              </div>
            );
          })}
          <button onClick={handleScan} disabled={scanning}>
            {scanning ? "Memindai..." : "Scan LAN"}
          </button>
          {scanError && <p role="alert">{scanError}</p>}
        </div>
        <div>
          <h3>Hasil Scan Bambu</h3>
          {bambuPrinters.map((p) => (
            <div key={p.serial}>
              <span>
                {p.ip} ({p.name})
              </span>
              {unpairedDevices.map((d) => (
                <button key={d.shortCode} onClick={() => startPairing(d.shortCode, p.ip, p.serial, suggestModelFromSsdp(p.model) ?? "")}>
                  Pasangkan ke {d.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div>
          <h3>Hasil Scan Moonraker</h3>
          {moonrakerPrinters.map((p) => (
            <div key={p.ip}>
              <span>
                {p.ip} ({p.name})
              </span>
              {unpairedDevices.map((d) => (
                // Moonraker (Klipper) tak punya konsep serial/access-code seperti Bambu — connector-nya
                // (packages/printer-monitor-core/src/connectors/moonraker.ts) cuma pakai `device.ip`,
                // jadi serial dikirim kosong; `accessCode` tetap diminta manual di form pairing yang sama
                // demi konsistensi bentuk DeviceSecret (Task 2), meski Moonraker tak memvalidasinya.
                <button key={d.shortCode} onClick={() => startPairing(d.shortCode, p.ip, "", "")}>
                  Pasangkan ke {d.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      {pairing && (
        <div>
          {pairing.isManual && (
            <>
              <label htmlFor="manual-ip">IP</label>
              <input
                id="manual-ip"
                value={pairing.ip}
                onChange={(e) => setPairing({ ...pairing, ip: e.target.value })}
              />
              <label htmlFor="manual-serial">Serial</label>
              <input
                id="manual-serial"
                value={pairing.serial}
                onChange={(e) => setPairing({ ...pairing, serial: e.target.value })}
              />
            </>
          )}
          <label htmlFor="model">Model</label>
          <input
            id="model"
            value={pairing.model}
            onChange={(e) => setPairing({ ...pairing, model: e.target.value })}
            placeholder="mis. P1S"
          />
          <label htmlFor="access-code">Access Code</label>
          <input id="access-code" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
          <button onClick={savePairing}>Simpan Pairing</button>
          {pairError && <p role="alert">{pairError}</p>}
        </div>
      )}
      {/* Di luar blok `{pairing && ...}` SENGAJA -- savePairing() men-set pairing kembali ke
          null setelah sukses (form pairing ditutup, device pindah ke status "Terpasang"),
          jadi peringatan model non-blocking ini harus tetap terlihat SESUDAH form hilang. */}
      {modelWarning && <p>{modelWarning}</p>}
    </div>
  );
}
