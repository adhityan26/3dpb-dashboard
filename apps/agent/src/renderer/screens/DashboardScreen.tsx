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
