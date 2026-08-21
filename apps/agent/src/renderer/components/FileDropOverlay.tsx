import { useState, type DragEvent, type ReactNode } from "react";

const HARD_BLOCK_BYTES = 4 * 1024 * 1024 * 1024;
const SOFT_WARN_BYTES = 500 * 1024 * 1024;

interface FileDropOverlayProps {
  shortCode: string;
  deviceLabel: string;
  onUploaded: (remotePath: string) => void;
  // Opsional -- dipakai DashboardScreen buat membungkus isi card device supaya area drop
  // meliputi seluruh card, bukan cuma strip kosong. Tanpa children, komponen tetap berdiri
  // sendiri persis seperti test brief (drop zone kosong + indikator drag/error).
  children?: ReactNode;
}

export function FileDropOverlay({ shortCode, deviceLabel, onUploaded, children }: FileDropOverlayProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;

    const isGcodeFile = file.name.endsWith(".gcode.3mf") || file.name.endsWith(".gcode");
    if (!isGcodeFile) {
      setError("Hanya file .gcode atau .gcode.3mf yang didukung");
      return;
    }
    if (file.size >= HARD_BLOCK_BYTES) {
      setError("File terlalu besar (maks 4GB)");
      return;
    }
    if (file.size > SOFT_WARN_BYTES) {
      // eslint-disable-next-line no-console
      console.warn("File besar (>500MB), upload mungkin lambat");
    }

    setError(null);
    const remotePath = `/${file.name}`;
    // `File.path` dihapus dari Electron sejak versi 32 -- WAJIB lewat preload
    // (webUtils.getPathForFile), jangan baca file.path langsung di renderer.
    const localPath = window.agentApi.getPathForFile(file);
    try {
      await window.agentApi.uploadFile(shortCode, localPath, remotePath);
      onUploaded(remotePath);
    } catch {
      setError("Upload gagal — printer offline atau koneksi terputus");
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {dragging && <div>Drop untuk kirim ke {deviceLabel}</div>}
      {error && <div role="alert">{error}</div>}
      {children}
    </div>
  );
}
