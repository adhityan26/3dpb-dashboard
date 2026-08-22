import { useEffect, useRef, useState } from "react";
import type { PrintersPayload } from "@3pb/printer-monitor-core";
import type { SyncResult } from "../../main/ipc";
import { AgentShell } from "../AgentShell";
import { GlassButton, GlassCard } from "@3pb/ui";
import { getPrinterImage } from "../lib/printer-images";
import { PrinterControls } from "../components/PrinterControls";
import { FileDropOverlay } from "../components/FileDropOverlay";
import { PrintStartDialog } from "../components/PrintStartDialog";
import { FileBrowserScreen } from "./FileBrowserScreen";

/** Thumbnail asli kalau model (`p.type`) dikenal, fallback emoji generik kalau tidak. */
function PrinterThumb({ model }: { model: string }) {
  const src = getPrinterImage(model);
  if (!src) return <span aria-hidden="true" className="text-2xl leading-none">🖨️</span>;
  return <img src={src} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />;
}

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
    case "wrong_server":
      return "Server yang dituju bukan app Slizebiz (balas halaman web, bukan data) — build Agent ini salah alamat server, hubungi 3D Printing Bandung buat installer yang benar.";
    case "network_error":
    default:
      return "Gagal konek ke server Slizebiz — device tetap jalan dari data lokal terakhir.";
  }
}

// Pemetaan state printer -> warna status (skill glass-ui-theme §Status Colors). Kasus tak
// dikenal (state baru dari firmware/printer yang belum dipetakan) sengaja jatuh ke g-t4
// (redup netral), bukan warna status apa pun -- lebih aman daripada menyiratkan makna salah.
// Nilai kanonik dari PrinterState (packages/printer-monitor-core/src/types.ts) adalah "pause"
// (tanpa "d") -- STATE_MAP di normalize-bambu.ts/normalize-moonraker.ts menormalisasi semua
// varian upstream (RUNNING/PAUSE/PAUSED, dst) ke situ. "paused" dipertahankan sebagai jaga-jaga
// kalau ada sumber data lama/lain yang masih pakai ejaan itu.
function statusColorClass(state: string): string {
  switch (state.toLowerCase()) {
    case "running":
      return "g-success";
    // "finish" = print selesai sukses, bukan status netral -- disamakan dengan "running"
    // (g-success) karena "selesai" adalah outcome positif, sama seperti "sedang jalan"
    // (final review Finding 3).
    case "finish":
      return "g-success";
    case "idle":
    case "pause":
    case "paused":
      return "g-info";
    case "error":
      return "g-error";
    default:
      // Termasuk "offline" (dari payload `packages/agent` yang kirim "OFFLINE" uppercase,
      // di-lowercase di atas jadi "offline") -- SENGAJA jatuh ke sini, bukan lupa
      // ditangani. Dim/netral (g-t4) memang perlakuan yang benar untuk printer yang tak
      // bisa dihubungi, sama seperti state yang benar-benar tak dikenal.
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
export function DashboardScreen({
  initialSync = false,
  onManageDevices = () => {},
}: { initialSync?: boolean; onManageDevices?: () => void } = {}) {
  const [snapshot, setSnapshot] = useState<PrintersPayload>({ payload: [] });
  // Device yang lagi dibuka halaman File-nya (halaman penuh, bukan panel inline di card --
  // lihat FileBrowserScreen). null = tampilkan dashboard normal.
  const [viewingFilesFor, setViewingFilesFor] = useState<{ shortCode: string; label: string } | null>(null);
  const [brokerInfo, setBrokerInfo] = useState<{ ip: string; port: number | null; pin: string | null } | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });
  const [updateAvailable, setUpdateAvailable] = useState(false);
  type LogSendStatus = { kind: "idle" } | { kind: "sending" } | { kind: "success" } | { kind: "error"; message: string };
  const [logSendStatus, setLogSendStatus] = useState<LogSendStatus>({ kind: "idle" });
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

  useEffect(() => {
    const load = () => {
      window.agentApi
        .getUpdateStatus()
        .then((s) => setUpdateAvailable(s.updateAvailable))
        .catch((err) => console.error("[dashboard] gagal cek update", err));
    };
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  function logSendErrorMessage(reason: string | undefined): string {
    if (reason === "too_large") return "Log terlalu besar";
    return "Gagal mengirim log";
  }

  async function handleSendLogs() {
    setLogSendStatus({ kind: "sending" });
    try {
      const result = await window.agentApi.sendLogs();
      if (result.ok) {
        setLogSendStatus({ kind: "success" });
      } else {
        setLogSendStatus({ kind: "error", message: logSendErrorMessage(result.reason) });
      }
    } catch (err) {
      console.error("[dashboard] kirim log gagal", err);
      setLogSendStatus({ kind: "error", message: "Gagal mengirim log — coba lagi." });
    }
  }

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

  if (viewingFilesFor) {
    return (
      <FileBrowserScreen
        shortCode={viewingFilesFor.shortCode}
        deviceLabel={viewingFilesFor.label}
        onBack={() => setViewingFilesFor(null)}
      />
    );
  }

  return (
    <AgentShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="g-t1 text-lg font-semibold">Dashboard</h1>
        {/* Satu-satunya jalan balik ke PairingScreen -- dari sini user bisa Edit/Lupakan
            device yang salah access code-nya atau salah pasang ke slot yang keliru, tanpa
            harus tahu trik "refresh app". */}
        <div className="flex items-center gap-2">
          {updateAvailable && (
            <button
              type="button"
              onClick={() => window.agentApi.openDownloadPage().catch((err) => console.error("[dashboard] gagal buka halaman download", err))}
              className="text-[11px] px-3 py-1.5 rounded-md g-btn-ghost"
            >
              Versi baru tersedia — klik untuk unduh
            </button>
          )}
          <button
            type="button"
            onClick={handleSendLogs}
            disabled={logSendStatus.kind === "sending"}
            className="text-[11px] px-3 py-1.5 rounded-md g-btn-ghost"
          >
            {logSendStatus.kind === "sending" ? "Mengirim..." : "Kirim log ke tim support"}
          </button>
          <GlassButton onClick={onManageDevices} className="text-xs opacity-70">
            Pengaturan
          </GlassButton>
        </div>
      </div>
      {logSendStatus.kind === "success" && (
        <p className="g-success text-xs mb-2">Log terkirim ke tim support.</p>
      )}
      {logSendStatus.kind === "error" && (
        <p role="alert" className="g-error text-xs mb-2">{logSendStatus.message}</p>
      )}
      <p className="g-t4 text-[11px] mb-3">
        Log berisi info koneksi (IP lokal, ID printer) untuk membantu diagnosa — tidak berisi PIN atau kredensial.
      </p>
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
          {brokerInfo.port !== null && brokerInfo.pin !== null && (
            <p className="g-t2 text-sm mt-1">
              PIN broker (ketik ini juga di setup WiFi CYD): <span className="font-semibold">{brokerInfo.pin}</span>
            </p>
          )}
        </GlassCard>
      )}
      <div className="space-y-3">
        {snapshot.payload.map((p) => (
          <DeviceCard key={p.id} p={p} onOpenFiles={() => setViewingFilesFor({ shortCode: p.id, label: p.name })} />
        ))}
      </div>
    </AgentShell>
  );
}

/**
 * Satu card device -- diekstrak dari inline `.map()` supaya tiap device punya state
 * lokalnya sendiri (path file yang lagi diproses lewat `PrintStartDialog` dari drag-drop
 * upload) tanpa perlu Map/Record ber-keyed-id di parent. Halaman File sendiri sekarang
 * di parent (`viewingFilesFor` di DashboardScreen) -- lihat FileBrowserScreen -- bukan
 * panel inline di sini lagi, jadi tombol "File" cuma memanggil `onOpenFiles`.
 */
function DeviceCard({ p, onOpenFiles }: { p: PrintersPayload["payload"][number]; onOpenFiles: () => void }) {
  const [printDialogPath, setPrintDialogPath] = useState<string | null>(null);

  const isBambu = p.connector === "bambu";

  const cardBody = (
    <>
      <div className="flex items-center gap-3">
        <PrinterThumb model={p.type} />
        <div className="min-w-0 flex-1">
          <div className="g-t1 text-sm font-medium truncate">{p.name}</div>
          {/* Nama file yang lagi dicetak -- kosong kalau idle/tak ada job aktif, jangan
              tampil baris kosong. */}
          {p.filename && <div className="g-t3 text-xs truncate">{p.filename}</div>}
        </div>
        <span className={`flex-shrink-0 text-sm ${statusColorClass(p.error_message ? "error" : p.state)}`}>
          {p.state} — {p.progress}%
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        {/* Suhu terakhir diketahui tetap ditampilkan walau printer OFFLINE (sama
            seperti progress/filename -- payload.ts sengaja mempertahankan data
            terakhir, bukan me-reset ke 0, kecuali memang belum pernah ada data sama
            sekali). */}
        <span className="g-t3 text-xs">
          Nozzle {p.nozzle_temp}°C · Bed {p.bed_temp}°C
        </span>
      </div>
      <PrinterControls deviceId={p.id} state={p.state} connector={p.connector} />
      {/* Percaya error_message non-kosong SAJA (bukan p.state === "error") -- backend
          (state-store.ts) sekarang isi error_message juga utk kasus state="pause" dgn
          print_error non-zero (Bambu genuinely error tapi lapor state PAUSE, bukan
          ERROR -- kasus nyata "Uranus" P1S). upsertFromStatus BANGUN ULANG row tiap
          status masuk (bukan merge), jadi error_message otomatis kosong lagi begitu
          printer pulih -- tak ada kekhawatiran pesan basi nyangkut. */}
      {p.error_message && (
        <p role="alert" className="g-error mt-2 text-xs">
          {p.error_message}
        </p>
      )}
      {/* File manager (browse/upload/print via FTPS) hanya berlaku untuk konektor Bambu --
          Moonraker belum didukung (di luar scope task ini), lihat pola gating yang sama
          di PrinterControls. */}
      {isBambu && (
        <div className="mt-2">
          <GlassButton onClick={onOpenFiles} className="text-xs opacity-70">
            File
          </GlassButton>
        </div>
      )}
    </>
  );

  return (
    <GlassCard className="p-4">
      {isBambu ? (
        <FileDropOverlay shortCode={p.id} deviceLabel={p.name} onUploaded={(remotePath) => setPrintDialogPath(remotePath)}>
          {cardBody}
        </FileDropOverlay>
      ) : (
        cardBody
      )}
      {printDialogPath && (
        <PrintStartDialog
          shortCode={p.id}
          deviceLabel={p.name}
          remotePath={printDialogPath}
          onClose={() => setPrintDialogPath(null)}
        />
      )}
    </GlassCard>
  );
}
