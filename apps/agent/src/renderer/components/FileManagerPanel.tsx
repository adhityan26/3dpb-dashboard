import { useEffect, useState, useCallback, useRef } from "react";
import { GlassCard, GlassButton } from "@3pb/ui";
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

// File yang bisa dikirim print & di-thumbnail-kan lewat agent:file-thumbnail.
function isPrintable(path: string): boolean {
  return path.endsWith(".gcode.3mf") || path.endsWith(".gcode");
}

// Overlay modal standar di app ini (dipakai PrinterControls) -- z-50 supaya di atas
// konten lain, bg gelap semi-transparan sebagai backdrop.
const MODAL_OVERLAY = "fixed inset-0 bg-black/45 flex items-center justify-center z-50";

export function FileManagerPanel({ shortCode, onPrintRequested }: FileManagerPanelProps) {
  const [entries, setEntries] = useState<PrinterFileEntry[]>([]);
  // Thumbnail SENGAJA lazy (bukan auto-fetch semua file saat load) -- tiap thumbnail =
  // download SELURUH file lewat FTPS (connect-per-operation) cuma buat ambil PNG kecil di
  // dalamnya. Direktori berisi puluhan file @beberapa-puluh-MB bikin auto-fetch sekuensial
  // makan waktu sangat lama / gak pernah selesai. User klik ikon placeholder buat load
  // on-demand per file.
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
  const [loadingThumbnailFor, setLoadingThumbnailFor] = useState<Set<string>>(new Set());
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
  const menuRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await window.agentApi.listFiles(shortCode, "/");
      setLoadError(null);
      setEntries(list);
    } catch {
      setLoadError("Gagal memuat daftar file — printer mungkin offline");
    }
  }, [shortCode]);

  useEffect(() => {
    load();
  }, [load]);

  // Tutup menu aksi kalau klik di luar menu (menu tak punya backdrop sendiri, beda dari
  // dialog konfirmasi/rename yang memang modal).
  useEffect(() => {
    if (!menuOpenFor) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenFor(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenFor]);

  async function loadThumbnail(path: string) {
    if (thumbnails[path] !== undefined || loadingThumbnailFor.has(path)) return;
    setLoadingThumbnailFor((prev) => new Set(prev).add(path));
    try {
      const thumb = await window.agentApi.getFileThumbnail(shortCode, path);
      setThumbnails((prev) => ({ ...prev, [path]: thumb }));
    } finally {
      setLoadingThumbnailFor((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }

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
      <div className="flex items-center justify-between mb-2">
        <GlassButton onClick={toggleSelectMode} className="text-xs opacity-70">
          {selectMode ? "Batal Select" : "Select"}
        </GlassButton>

        {selectMode && selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="g-t3 text-xs">{selected.size} file dipilih</span>
            <GlassButton onClick={() => downloadPaths(selected)} className="text-xs">
              Download ({selected.size})
            </GlassButton>
            <GlassButton onClick={() => setPendingDelete(new Set(selected))} className="text-xs">
              Hapus ({selected.size})
            </GlassButton>
          </div>
        )}
      </div>

      {deleteError && (
        <p role="alert" className="g-error text-xs mb-2">
          {deleteError}
        </p>
      )}
      {downloadError && (
        <p role="alert" className="g-error text-xs mb-2">
          {downloadError}
        </p>
      )}

      {pendingDelete && (
        <div className={MODAL_OVERLAY} role="dialog" aria-label="konfirmasi hapus">
          <GlassCard className="p-4 max-w-xs w-full mx-4">
            <p className="g-t1 text-sm font-medium mb-1">Hapus {pendingDelete.size} file?</p>
            <p className="g-t3 text-xs mb-4">Aksi ini tidak bisa dibatalkan.</p>
            <div className="flex gap-2">
              <GlassButton onClick={() => setPendingDelete(null)} className="flex-1 text-xs">
                Batal
              </GlassButton>
              <GlassButton onClick={performDelete} className="flex-1 text-xs">
                Ya, Hapus
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {renaming && (
        <div className={MODAL_OVERLAY} role="dialog" aria-label="rename file">
          <GlassCard className="p-4 max-w-xs w-full mx-4">
            <p className="g-t1 text-sm font-medium mb-2">Rename {renaming.path.split("/").pop()}</p>
            <input
              aria-label="nama baru"
              value={renaming.value}
              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
              className="glass-input rounded-[5px] px-2 h-8 text-xs w-full mb-2"
            />
            {renameError && (
              <p role="alert" className="g-error text-xs mb-2">
                {renameError}
              </p>
            )}
            <div className="flex gap-2">
              <GlassButton
                onClick={() => {
                  setRenaming(null);
                  setRenameError(null);
                }}
                className="flex-1 text-xs"
              >
                Batal
              </GlassButton>
              <GlassButton onClick={performRename} className="flex-1 text-xs">
                Simpan
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {zoomedThumbnail && (
        <div className={MODAL_OVERLAY} role="dialog" aria-label="thumbnail preview" onClick={() => setZoomedThumbnail(null)}>
          <img src={zoomedThumbnail} alt="preview besar" className="max-w-[80vw] max-h-[80vh] rounded-[10px]" />
        </div>
      )}

      {loadError && (
        <div className="mb-2">
          <p role="alert" className="g-error text-xs mb-1">
            {loadError}
          </p>
          <GlassButton onClick={() => load()} className="text-xs">
            Coba Lagi
          </GlassButton>
        </div>
      )}

      <div className="g-inner rounded-[10px] overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--g-inner-border)]">
              {selectMode && <th className="w-8 p-2"></th>}
              <th className="w-12 p-2"></th>
              <th className="text-left p-2 g-t3 font-normal">Nama</th>
              <th className="text-right p-2 g-t3 font-normal whitespace-nowrap">Ukuran</th>
              <th className="text-right p-2 g-t3 font-normal whitespace-nowrap">Modified</th>
              <th className="w-8 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.path} className="border-b border-[var(--g-inner-border)] last:border-0">
                {selectMode && (
                  <td className="p-2 align-middle">
                    {!entry.isDirectory && (
                      <input
                        type="checkbox"
                        aria-label={entry.name}
                        checked={selected.has(entry.path)}
                        onChange={() => toggleSelected(entry.path)}
                      />
                    )}
                  </td>
                )}
                <td className="p-2 align-middle">
                  {entry.isDirectory ? (
                    <span aria-hidden className="text-lg">📁</span>
                  ) : thumbnails[entry.path] ? (
                    <img
                      src={thumbnails[entry.path] ?? undefined}
                      alt=""
                      role="button"
                      aria-label={`zoom ${entry.name}`}
                      onClick={() => setZoomedThumbnail(thumbnails[entry.path] ?? null)}
                      className="w-10 h-10 rounded-[6px] object-cover cursor-zoom-in"
                    />
                  ) : isPrintable(entry.path) ? (
                    <button
                      type="button"
                      aria-label={`load thumbnail ${entry.name}`}
                      onClick={() => loadThumbnail(entry.path)}
                      className="w-10 h-10 rounded-[6px] g-btn-ghost flex items-center justify-center text-base"
                      disabled={loadingThumbnailFor.has(entry.path)}
                    >
                      {loadingThumbnailFor.has(entry.path) ? "…" : "🖼️"}
                    </button>
                  ) : (
                    <span aria-hidden className="text-lg">📄</span>
                  )}
                </td>
                <td className="p-2 align-middle g-t1 max-w-xs truncate" title={entry.name}>
                  {entry.name}
                </td>
                <td className="p-2 align-middle g-t3 text-right whitespace-nowrap">
                  {entry.isDirectory ? "--" : formatSize(entry.size)}
                </td>
                <td className="p-2 align-middle g-t3 text-right whitespace-nowrap">
                  {entry.isDirectory ? "--" : formatDate(entry.modifiedAt)}
                </td>
                <td className="p-2 align-middle relative">
                  {!entry.isDirectory && (
                    <>
                      <button
                        type="button"
                        aria-label={`aksi ${entry.name}`}
                        onClick={() => setMenuOpenFor((cur) => (cur === entry.path ? null : entry.path))}
                        className="g-t2 px-2 rounded-[5px] hover:g-btn-ghost"
                      >
                        ⋮
                      </button>
                      {menuOpenFor === entry.path && (
                        <div
                          ref={menuRef}
                          role="menu"
                          aria-label={`menu ${entry.name}`}
                          className="g-card absolute right-0 top-full mt-1 z-50 rounded-[8px] py-1 min-w-[120px] shadow-lg"
                        >
                          <button
                            role="menuitem"
                            className="g-t1 text-left w-full px-3 py-1.5 text-xs hover:g-btn-ghost"
                            onClick={() => {
                              setMenuOpenFor(null);
                              onPrintRequested(entry.path);
                            }}
                          >
                            Print
                          </button>
                          <button
                            role="menuitem"
                            className="g-t1 text-left w-full px-3 py-1.5 text-xs hover:g-btn-ghost"
                            onClick={() => {
                              setMenuOpenFor(null);
                              downloadPaths(new Set([entry.path]));
                            }}
                          >
                            Download
                          </button>
                          <button
                            role="menuitem"
                            className="g-t1 text-left w-full px-3 py-1.5 text-xs hover:g-btn-ghost"
                            onClick={() => {
                              setMenuOpenFor(null);
                              setRenaming({ path: entry.path, value: entry.name });
                            }}
                          >
                            Rename
                          </button>
                          <button
                            role="menuitem"
                            className="g-error text-left w-full px-3 py-1.5 text-xs hover:g-btn-ghost"
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
    </div>
  );
}
