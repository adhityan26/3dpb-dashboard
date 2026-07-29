import { useState } from "react";
import type { SaasDevice } from "../../main/saas-client";
import type { DiscoveredBambuPrinter } from "../../main/discovery/bambu-ssdp";

interface PairingTarget {
  shortCode: string;
  ip: string;
  serial: string;
  isManual: boolean;
}

export function PairingScreen({
  devices,
  onAllPaired,
}: {
  devices: SaasDevice[];
  onAllPaired: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [bambuPrinters, setBambuPrinters] = useState<DiscoveredBambuPrinter[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingTarget | null>(null);
  const [accessCode, setAccessCode] = useState("");

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
    await window.agentApi.pairDevice(pairing.shortCode, {
      ip: pairing.ip,
      serial: pairing.serial,
      accessCode,
    });
    setPairing(null);
    setAccessCode("");
    onAllPaired();
  }

  return (
    <div style={{ display: "flex", gap: 24, padding: 24, fontFamily: "sans-serif" }}>
      <div>
        <h3>Device Terdaftar</h3>
        {devices.map((d) => (
          <div key={d.shortCode}>
            <span>{d.label}</span>
            <button onClick={() => startManualPairing(d.shortCode)}>Isi manual</button>
          </div>
        ))}
        <button onClick={handleScan} disabled={scanning}>
          {scanning ? "Memindai..." : "Scan LAN"}
        </button>
        {scanError && <p role="alert">{scanError}</p>}
      </div>
      <div>
        <h3>Hasil Scan</h3>
        {bambuPrinters.map((p) => (
          <div key={p.serial}>
            <span>
              {p.ip} ({p.name})
            </span>
            {devices.map((d) => (
              <button key={d.shortCode} onClick={() => startPairing(d.shortCode, p.ip, p.serial)}>
                Pasangkan ke {d.label}
              </button>
            ))}
          </div>
        ))}
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
          <label htmlFor="access-code">Access Code</label>
          <input id="access-code" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
          <button onClick={savePairing}>Simpan Pairing</button>
        </div>
      )}
    </div>
  );
}
