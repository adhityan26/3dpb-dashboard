import { useState } from "react";
import { GlassButton, GlassCard } from "@3pb/ui";
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";

type Feedback = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string };

// Selama sending: semua tombol di kartu ini disabled (cegah double-klik). Sukses -> balik ke
// idle TANPA update state optimistik -- status printer yang sebenarnya muncul lewat polling
// 5 detik yang sudah ada di DashboardScreen, sama seperti tombol Sync.
function commandErrorMessage(message: string): string {
  switch (message) {
    case "printer_offline":
      return "Printer sedang offline -- perintah tak terkirim.";
    case "device_not_found":
    case "engine_not_running":
      return "Device belum termonitor -- coba Sync dulu.";
    case "unsupported_command":
      return "Perintah tak didukung printer ini.";
    default:
      return "Gagal kirim perintah -- coba lagi.";
  }
}

const SPEED_LEVEL_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Silent", 2: "Standard", 3: "Sport", 4: "Ludicrous",
};

/**
 * Kontrol Pause/Resume/Stop/Speed per kartu printer di DashboardScreen. Tombol yang tampil
 * berubah sesuai `state` (bukan selalu tampil semua-disabled) -- lihat spec
 * docs/superpowers/specs/2026-08-10-agent-printer-control-design.md §UI.
 */
export function PrinterControls({
  deviceId,
  state,
  connector,
}: {
  deviceId: string;
  state: string;
  connector: string;
}) {
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [speedLevel, setSpeedLevel] = useState<1 | 2 | 3 | 4>(2);
  const [speedPercent, setSpeedPercent] = useState(100);

  const s = state.toLowerCase();
  const busy = feedback.kind === "sending";

  async function send(cmd: PrinterCommand) {
    setFeedback({ kind: "sending" });
    try {
      const result: CommandResult = await window.agentApi.sendPrinterCommand(deviceId, cmd);
      if (result.ok) setFeedback({ kind: "idle" });
      else setFeedback({ kind: "error", message: commandErrorMessage(result.message) });
    } catch {
      setFeedback({ kind: "error", message: "Gagal kirim perintah -- coba lagi." });
    }
  }

  // Satu-satunya tempat yang membentuk & mengirim setSpeedPercent -- dipanggil dari
  // mouseUp/touchEnd (drag selesai) DAN keyUp (arrow/Home/End di slider yang fokus).
  // Sebelum ini keyUp tak ter-cover: label {speedPercent}% berubah tapi command tak
  // pernah terkirim, jadi UI diam-diam nampilin speed yang printer-nya gak benar-benar jalankan.
  function commitSpeed(percent: number) {
    void send({ kind: "setSpeedPercent", percent });
  }

  const showRunningControls = s === "running";
  const showPausedControls = s === "pause" || s === "paused" || s === "error";
  if (!showRunningControls && !showPausedControls) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        {showRunningControls && (
          <GlassButton onClick={() => void send({ kind: "pause" })} disabled={busy} className="text-xs px-3 h-8">
            Pause
          </GlassButton>
        )}
        {showPausedControls && (
          <GlassButton onClick={() => void send({ kind: "resume" })} disabled={busy} className="text-xs px-3 h-8">
            Resume
          </GlassButton>
        )}

        {showRunningControls && connector === "bambu" && (
          <select
            aria-label="Kecepatan print"
            className="glass-input rounded-[5px] px-2 h-8 text-xs flex-1"
            value={speedLevel}
            disabled={busy}
            onChange={(e) => {
              const level = Number(e.target.value) as 1 | 2 | 3 | 4;
              setSpeedLevel(level);
              void send({ kind: "setSpeedLevel", level });
            }}
          >
            {([1, 2, 3, 4] as const).map((level) => (
              <option key={level} value={level}>{SPEED_LEVEL_LABELS[level]}</option>
            ))}
          </select>
        )}
        {showRunningControls && connector === "moonraker" && (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="range"
              aria-label="Kecepatan print (persen)"
              min={20}
              max={200}
              step={10}
              value={speedPercent}
              disabled={busy}
              onChange={(e) => setSpeedPercent(Number(e.target.value))}
              onMouseUp={(e) => commitSpeed(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => commitSpeed(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => commitSpeed(Number((e.target as HTMLInputElement).value))}
              className="flex-1"
            />
            <span className="g-t3 text-xs w-10 text-right">{speedPercent}%</span>
          </div>
        )}

        <GlassButton
          onClick={() => setConfirmingStop(true)}
          disabled={busy}
          className="text-xs px-3 h-8 ml-auto"
          style={{ color: "#ef4444" }}
        >
          Stop
        </GlassButton>
      </div>

      {feedback.kind === "error" && (
        <p role="alert" className="g-error mt-1 text-xs">
          {feedback.message}
        </p>
      )}

      {confirmingStop && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <GlassCard className="p-4 max-w-xs w-full mx-4">
            <p className="g-t1 text-sm font-medium mb-1">Batalkan print?</p>
            <p className="g-t3 text-xs mb-4">Proses akan dihentikan, tidak bisa diulang kembali.</p>
            <div className="flex gap-2">
              <GlassButton
                onClick={() => setConfirmingStop(false)}
                className="flex-1 text-xs"
                style={{ background: "#10b981", color: "#fff" }}
              >
                Tidak
              </GlassButton>
              <GlassButton
                onClick={() => {
                  setConfirmingStop(false);
                  void send({ kind: "stop" });
                }}
                className="flex-1 text-xs"
                style={{ background: "#ef4444", color: "#fff" }}
              >
                Ya, batalkan
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
