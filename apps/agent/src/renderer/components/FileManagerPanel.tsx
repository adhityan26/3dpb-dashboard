import { useEffect, useState, useCallback } from "react";
import type { PrinterFileEntry } from "../../main/file-manager/types";

interface FileManagerPanelProps {
  shortCode: string;
  onPrintRequested: (remotePath: string) => void;
}

export function FileManagerPanel({ shortCode, onPrintRequested }: FileManagerPanelProps) {
  const [entries, setEntries] = useState<PrinterFileEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [zoomedThumbnail, setZoomedThumbnail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDownloadError, setBulkDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await window.agentApi.listFiles(shortCode, "/");
      setLoadError(null);
      setEntries(list);
      // Sekuensial (bukan fire-and-forget paralel) -- tiap thumbnail = download seluruh
      // file lewat koneksi FTPS baru (connect-per-operation), printer kemungkinan tak
      // sanggup handle banyak sesi FTPS bersamaan.
      for (const entry of list) {
        if (entry.path.endsWith(".gcode.3mf")) {
          const thumb = await window.agentApi.getFileThumbnail(shortCode, entry.path);
          setThumbnails((prev) => ({ ...prev, [entry.path]: thumb }));
        }
      }
    } catch {
      setLoadError("Gagal memuat daftar file — printer mungkin offline");
    }
  }, [shortCode]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelected(new Set());
  }

  async function confirmBulkDelete() {
    setBulkDeleteError(null);
    let failCount = 0;
    const total = selected.size;
    for (const path of selected) {
      try {
        await window.agentApi.deleteFile(shortCode, path);
      } catch {
        failCount += 1;
      }
    }
    setSelected(new Set());
    setConfirmingBulkDelete(false);
    if (failCount > 0) {
      setBulkDeleteError(`${total - failCount} dari ${total} file berhasil dihapus, ${failCount} gagal`);
    }
    await load();
  }

  async function bulkDownload() {
    const targetFolder = await window.agentApi.pickDownloadFolder();
    if (!targetFolder) return; // user batal dialog folder
    setBulkDownloadError(null);
    let failCount = 0;
    const total = selected.size;
    for (const path of selected) {
      const fileName = path.split("/").pop() ?? "download";
      try {
        // Forward slash hardcoded (bukan node:path join()) sengaja -- ini renderer, tak ada
        // "path" module natural di sini (tak ada precedent lain di renderer/ yg pakai
        // node:path), dan Node's fs tetap toleransi forward slash di semua platform termasuk
        // Windows.
        await window.agentApi.downloadFile(shortCode, path, `${targetFolder}/${fileName}`);
      } catch {
        failCount += 1;
      }
    }
    if (failCount > 0) {
      setBulkDownloadError(`${total - failCount} dari ${total} file berhasil didownload, ${failCount} gagal`);
    }
  }

  return (
    <div>
      <div>
        <button onClick={toggleSelectMode}>{selectMode ? "Batal Select" : "Select"}</button>
      </div>

      {selectMode && selected.size > 0 && (
        <div>
          <span>{selected.size} file dipilih</span>
          <button onClick={bulkDownload}>Download ({selected.size})</button>
          <button onClick={() => setConfirmingBulkDelete(true)}>Hapus ({selected.size})</button>
        </div>
      )}

      {bulkDeleteError && <p role="alert">{bulkDeleteError}</p>}
      {bulkDownloadError && <p role="alert">{bulkDownloadError}</p>}

      {confirmingBulkDelete && (
        <div role="dialog" aria-label="konfirmasi hapus">
          <p>Yakin hapus {selected.size} file? Aksi ini tidak bisa dibatalkan.</p>
          <button onClick={confirmBulkDelete}>Ya, Hapus</button>
          <button onClick={() => setConfirmingBulkDelete(false)}>Batal</button>
        </div>
      )}

      {zoomedThumbnail && (
        <div role="dialog" aria-label="thumbnail preview" onClick={() => setZoomedThumbnail(null)}>
          <img src={zoomedThumbnail} alt="preview besar" />
        </div>
      )}

      {loadError && (
        <div>
          <p role="alert">{loadError}</p>
          <button onClick={() => load()}>Coba Lagi</button>
        </div>
      )}

      <div>
        {entries.map((entry) => (
          <div key={entry.path}>
            {selectMode && !entry.isDirectory && (
              <input
                type="checkbox"
                aria-label={entry.name}
                checked={selected.has(entry.path)}
                onChange={() => toggleSelected(entry.path)}
              />
            )}
            {thumbnails[entry.path] ? (
              <img
                src={thumbnails[entry.path] ?? undefined}
                alt=""
                role="button"
                aria-label={`zoom ${entry.name}`}
                onClick={() => setZoomedThumbnail(thumbnails[entry.path] ?? null)}
                style={{ cursor: "zoom-in" }}
              />
            ) : (
              <span aria-hidden>🖼️</span>
            )}
            <span>{entry.name}</span>
            {!entry.isDirectory && <button onClick={() => onPrintRequested(entry.path)}>Print</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
