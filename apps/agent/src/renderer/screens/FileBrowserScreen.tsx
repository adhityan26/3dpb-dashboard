import { useState } from "react";
import { AgentShell } from "../AgentShell";
import { GlassButton } from "@3pb/ui";
import { FileManagerPanel } from "../components/FileManagerPanel";
import { PrintStartDialog } from "../components/PrintStartDialog";

interface FileBrowserScreenProps {
  shortCode: string;
  deviceLabel: string;
  onBack: () => void;
}

/**
 * Halaman penuh (bukan panel kecil di dalam card device) untuk browse/kelola file SD card
 * printer -- gaya Fluidd/Moonraker: tabel file dgn menu aksi per baris, bukan grid card.
 * Dibuka dari tombol "File" di DashboardScreen (lihat `viewingFilesFor` state di sana).
 */
export function FileBrowserScreen({ shortCode, deviceLabel, onBack }: FileBrowserScreenProps) {
  const [printDialogPath, setPrintDialogPath] = useState<string | null>(null);

  return (
    <AgentShell maxWidth="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="g-t1 text-lg font-semibold">File — {deviceLabel}</h1>
        <GlassButton onClick={onBack} className="text-xs opacity-70">
          Kembali
        </GlassButton>
      </div>
      <FileManagerPanel shortCode={shortCode} onPrintRequested={(remotePath) => setPrintDialogPath(remotePath)} />
      {printDialogPath && (
        <PrintStartDialog
          shortCode={shortCode}
          deviceLabel={deviceLabel}
          remotePath={printDialogPath}
          onClose={() => setPrintDialogPath(null)}
        />
      )}
    </AgentShell>
  );
}
