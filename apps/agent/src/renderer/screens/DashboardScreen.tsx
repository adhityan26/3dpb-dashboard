import { useEffect, useState } from "react";
import type { PrintersPayload } from "@3pb/printer-monitor-core";
import type { SyncResult } from "../../main/ipc";

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

export function DashboardScreen() {
  const [snapshot, setSnapshot] = useState<PrintersPayload>({ payload: [] });
  const [brokerInfo, setBrokerInfo] = useState<{ ip: string; port: number | null } | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });

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
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div>
        <button onClick={handleSync} disabled={syncStatus.kind === "syncing"}>
          {syncStatus.kind === "syncing" ? "Sync..." : "Sync"}
        </button>
        {syncStatus.kind === "success" && <span> Tersinkron ({syncStatus.deviceCount} device)</span>}
        {syncStatus.kind === "error" && <p role="alert">{syncStatus.message}</p>}
      </div>
      {brokerInfo && (
        <p>
          Alamat broker (ketik ini di setup WiFi CYD):{" "}
          {brokerInfo.port !== null ? `${brokerInfo.ip}:${brokerInfo.port}` : "broker belum jalan (port 1883 dipakai proses lain)"}
        </p>
      )}
      <ul>
        {snapshot.payload.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span> — {p.state} — {p.progress}%
          </li>
        ))}
      </ul>
    </div>
  );
}
