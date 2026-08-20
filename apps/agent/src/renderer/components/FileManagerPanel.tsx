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

  const load = useCallback(async () => {
    const list = await window.agentApi.listFiles(shortCode, "/");
    setEntries(list);
    for (const entry of list) {
      if (entry.path.endsWith(".gcode.3mf")) {
        window.agentApi.getFileThumbnail(shortCode, entry.path).then((thumb) => {
          setThumbnails((prev) => ({ ...prev, [entry.path]: thumb }));
        });
      }
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
    for (const path of selected) {
      await window.agentApi.deleteFile(shortCode, path);
    }
    setSelected(new Set());
    setConfirmingBulkDelete(false);
    await load();
  }

  async function bulkDownload() {
    const targetFolder = await window.agentApi.pickDownloadFolder();
    if (!targetFolder) return; // user batal dialog folder
    for (const path of selected) {
      const fileName = path.split("/").pop() ?? "download";
      await window.agentApi.downloadFile(shortCode, path, `${targetFolder}/${fileName}`);
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
