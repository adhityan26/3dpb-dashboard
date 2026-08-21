import { useEffect, useState, useCallback } from "react";
import type { PrinterFileEntry } from "../../main/file-manager/types";

interface FileManagerPanelProps {
  shortCode: string;
  onPrintRequested: (remotePath: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

// Direktori dari path root-flat ("/a.gcode" -> "/") -- belum ada navigasi subfolder di
// scope ini (listFiles selalu dipanggil dengan "/"), tapi rename tetap harus menjaga
// direktori asal kalau nanti navigasi ditambah.
function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

// File yang bisa dikirim print & di-thumbnail-kan lewat agent:file-thumbnail (Task ipc fix
// -- sekarang dukung .gcode polos juga, bukan cuma .gcode.3mf).
function isPrintable(path: string): boolean {
  return path.endsWith(".gcode.3mf") || path.endsWith(".gcode");
}

export function FileManagerPanel({ shortCode, onPrintRequested }: FileManagerPanelProps) {
  const [entries, setEntries] = useState<PrinterFileEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<Set<string> | null>(null);
  const [zoomedThumbnail, setZoomedThumbnail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await window.agentApi.listFiles(shortCode, "/");
      setLoadError(null);
      setEntries(list);
      // Sekuensial (bukan fire-and-forget paralel) -- tiap thumbnail = download seluruh
      // file lewat koneksi FTPS baru (connect-per-operation), printer kemungkinan tak
      // sanggup handle banyak sesi FTPS bersamaan.
      for (const entry of list) {
        if (isPrintable(entry.path)) {
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

  async function performDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    let failCount = 0;
    const paths = Array.from(pendingDelete);
    for (const path of paths) {
      try {
        await window.agentApi.deleteFile(shortCode, path);
      } catch {
        failCount += 1;
      }
    }
    setSelected(new Set());
    setPendingDelete(null);
    if (failCount > 0) {
      setDeleteError(`${paths.length - failCount} dari ${paths.length} file berhasil dihapus, ${failCount} gagal`);
    }
    await load();
  }

  async function downloadPaths(paths: Set<string>) {
    const targetFolder = await window.agentApi.pickDownloadFolder();
    if (!targetFolder) return; // user batal dialog folder
    setDownloadError(null);
    let failCount = 0;
    const list = Array.from(paths);
    for (const path of list) {
      const fileName = path.split("/").pop() ?? "download";
      try {
        // Forward slash hardcoded (bukan node:path join()) sengaja -- ini renderer, tak ada
        // "path" module natural di sini, dan Node's fs tetap toleransi forward slash di
        // semua platform termasuk Windows.
        await window.agentApi.downloadFile(shortCode, path, `${targetFolder}/${fileName}`);
      } catch {
        failCount += 1;
      }
    }
    if (failCount > 0) {
      setDownloadError(`${list.length - failCount} dari ${list.length} file berhasil didownload, ${failCount} gagal`);
    }
  }

  async function performRename() {
    if (!renaming) return;
    const trimmed = renaming.value.trim();
    if (!trimmed) {
      setRenameError("Nama tidak boleh kosong");
      return;
    }
    const newPath = joinPath(dirOf(renaming.path), trimmed);
    try {
      await window.agentApi.renameFile(shortCode, renaming.path, newPath);
      setRenaming(null);
      setRenameError(null);
      await load();
    } catch {
      setRenameError("Gagal rename — printer mungkin offline");
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
          <button onClick={() => downloadPaths(selected)}>Download ({selected.size})</button>
          <button onClick={() => setPendingDelete(new Set(selected))}>Hapus ({selected.size})</button>
        </div>
      )}

      {deleteError && <p role="alert">{deleteError}</p>}
      {downloadError && <p role="alert">{downloadError}</p>}

      {pendingDelete && (
        <div role="dialog" aria-label="konfirmasi hapus">
          <p>Yakin hapus {pendingDelete.size} file? Aksi ini tidak bisa dibatalkan.</p>
          <button onClick={performDelete}>Ya, Hapus</button>
          <button onClick={() => setPendingDelete(null)}>Batal</button>
        </div>
      )}

      {renaming && (
        <div role="dialog" aria-label="rename file">
          <p>Rename {renaming.path.split("/").pop()}</p>
          <input
            aria-label="nama baru"
            value={renaming.value}
            onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
          />
          {renameError && <p role="alert">{renameError}</p>}
          <button onClick={performRename}>Simpan</button>
          <button
            onClick={() => {
              setRenaming(null);
              setRenameError(null);
            }}
          >
            Batal
          </button>
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

      <table>
        <thead>
          <tr>
            {selectMode && <th></th>}
            <th></th>
            <th>Nama</th>
            <th>Ukuran</th>
            <th>Modified</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.path}>
              {selectMode && !entry.isDirectory && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={entry.name}
                    checked={selected.has(entry.path)}
                    onChange={() => toggleSelected(entry.path)}
                  />
                </td>
              )}
              {selectMode && entry.isDirectory && <td />}
              <td>
                {thumbnails[entry.path] ? (
                  <img
                    src={thumbnails[entry.path] ?? undefined}
                    alt=""
                    role="button"
                    aria-label={`zoom ${entry.name}`}
                    onClick={() => setZoomedThumbnail(thumbnails[entry.path] ?? null)}
                    style={{ cursor: "zoom-in", width: 40, height: 40, objectFit: "cover" }}
                  />
                ) : (
                  <span aria-hidden>{entry.isDirectory ? "📁" : "🖼️"}</span>
                )}
              </td>
              <td>{entry.name}</td>
              <td>{entry.isDirectory ? "--" : formatSize(entry.size)}</td>
              <td>{entry.isDirectory ? "--" : formatDate(entry.modifiedAt)}</td>
              <td style={{ position: "relative" }}>
                {!entry.isDirectory && (
                  <>
                    <button
                      aria-label={`aksi ${entry.name}`}
                      onClick={() => setMenuOpenFor((cur) => (cur === entry.path ? null : entry.path))}
                    >
                      ⋮
                    </button>
                    {menuOpenFor === entry.path && (
                      <div role="menu" aria-label={`menu ${entry.name}`}>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenFor(null);
                            onPrintRequested(entry.path);
                          }}
                        >
                          Print
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenFor(null);
                            downloadPaths(new Set([entry.path]));
                          }}
                        >
                          Download
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenFor(null);
                            setRenaming({ path: entry.path, value: entry.name });
                          }}
                        >
                          Rename
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenFor(null);
                            setPendingDelete(new Set([entry.path]));
                          }}
                        >
                          Hapus
                        </button>
                      </div>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
