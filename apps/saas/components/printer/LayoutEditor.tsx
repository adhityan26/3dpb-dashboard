"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { LAYOUT_LIMITS, type FieldRow, type LayoutCellOut, type LayoutConfigOut, type LayoutPageOut } from "@3pb/cyd-layout-schema";
import { PrinterPalette, DeviceCardPreview, type PaletteDevice } from "./layout-editor/PrinterPalette";
import { GridCanvas, CanvasCellPreview } from "./layout-editor/GridCanvas";
import { PageTabs } from "./layout-editor/PageTabs";
import { CellSettingsPanel } from "./layout-editor/CellSettingsPanel";

/**
 * Editor layout CYD versi SaaS — hasil porting `apps/dashboard/app/(dashboard)/cyd-layout`.
 * Beda pokok dari sumbernya:
 * - Sumber printer = `Device` milik user (prop `devices`, di-fetch server-side), identitasnya
 *   `device.shortCode`; dashboard pakai `printer.slug` dari `/api/cyd-layout/printers`.
 * - Tak ada data live (state/progress) — SaaS belum punya endpoint itu di editor.
 * - Default grid kecil 2x2 (mirror `defaultSaasLayout()` di lib/cyd-layout/service.ts),
 *   bukan 10x8 rak internal.
 * - Simpan = `PUT /api/cyd-layout` dengan body config polos (server dashboard: `POST {config}`).
 */

function defaultConfig(): LayoutConfigOut {
  return {
    schemaVersion: 1,
    pages: [{ id: "hal-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }],
  };
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Input teks header dengan state lokal supaya counter/peringatan muncul saat mengetik (pola sama LabelTextField di CellSettingsPanel). */
function HeaderTextField({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const byteLen = utf8Length(text);
  const tooLong = byteLen > LAYOUT_LIMITS.headerTextMaxLength;
  return (
    <label className="g-t2 block text-xs">
      Teks header (opsional)
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text.trim())}
        placeholder='mis. "Semangat pagi! Cetak lancar hari ini"'
        className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
      />
      <span className={`mt-1 block text-[10px] leading-relaxed ${tooLong ? "text-red-500" : "g-t4"}`}>
        {byteLen}/{LAYOUT_LIMITS.headerTextMaxLength} byte{tooLong ? " — simpan akan ditolak." : ""}
      </span>
    </label>
  );
}

function isLayoutConfig(value: unknown): value is LayoutConfigOut {
  if (typeof value !== "object" || value === null) return false;
  const cfg = value as { pages?: unknown };
  return Array.isArray(cfg.pages) && cfg.pages.length > 0;
}

function findFieldLabelProblem(rows: FieldRow[] | undefined): string | null {
  for (const row of rows ?? []) {
    for (const entry of row) {
      if (typeof entry === "object" && entry.label && entry.label.length > LAYOUT_LIMITS.maxLabelLength) {
        return `Label field "${entry.label}" lebih dari ${LAYOUT_LIMITS.maxLabelLength} karakter.`;
      }
    }
  }
  return null;
}

/**
 * Validasi FE ringan sebelum PUT — BUKAN pengganti `validateLayoutConfig` di server (Task 8),
 * cuma supaya user dapat pesan yang jelas alih-alih 400 mentah.
 */
export function findLayoutProblem(config: LayoutConfigOut): string | null {
  if (config.headerText !== undefined && utf8Length(config.headerText) > LAYOUT_LIMITS.headerTextMaxLength) {
    return `Teks header lebih dari ${LAYOUT_LIMITS.headerTextMaxLength} byte.`;
  }
  if (config.pages.length > LAYOUT_LIMITS.maxPages) return `Maksimal ${LAYOUT_LIMITS.maxPages} halaman.`;
  for (const page of config.pages) {
    const pageLabelErr = findFieldLabelProblem(page.fields);
    if (pageLabelErr) return pageLabelErr;
    if (page.id.length > LAYOUT_LIMITS.maxPageIdLength) {
      return `Nama halaman "${page.id}" lebih dari ${LAYOUT_LIMITS.maxPageIdLength} karakter.`;
    }
    if (page.cells.length > LAYOUT_LIMITS.maxCellsPerPage) {
      return `Halaman "${page.id}" punya lebih dari ${LAYOUT_LIMITS.maxCellsPerPage} sel.`;
    }
    for (const cell of page.cells) {
      if ("type" in cell) {
        if (cell.text.length > LAYOUT_LIMITS.maxLabelTextLength) {
          return `Teks label "${cell.text}" lebih dari ${LAYOUT_LIMITS.maxLabelTextLength} karakter.`;
        }
      } else {
        if (cell.printer.length > LAYOUT_LIMITS.maxPrinterIdLength) {
          return `Kode printer "${cell.printer}" lebih dari ${LAYOUT_LIMITS.maxPrinterIdLength} karakter.`;
        }
        if (cell.fields && cell.fields.length > LAYOUT_LIMITS.maxRowsPerFieldsCellOverride) {
          return `Preset per-sel maksimal ${LAYOUT_LIMITS.maxRowsPerFieldsCellOverride} baris.`;
        }
        const labelErr = findFieldLabelProblem(cell.fields);
        if (labelErr) return labelErr;
      }
    }
  }
  return null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function LayoutEditor({ devices }: { devices: PaletteDevice[] }) {
  const [config, setConfig] = useState<LayoutConfigOut>(defaultConfig);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [draggingDevice, setDraggingDevice] = useState<PaletteDevice | null>(null);
  const [draggingCell, setDraggingCell] = useState<LayoutCellOut | null>(null);

  // distance:4 supaya klik-biasa (buat select sel) tetap bisa dibedakan dari drag — tanpa ini
  // PointerSensor mulai drag pada gerakan sekecil apa pun dan menelan onClick.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Counter monoton buat id halaman baru — tak pernah dipakai ulang walau halaman dihapus,
  // jadi tak bisa bentrok dengan id yang masih (atau pernah) ada di config.pages.
  const nextPageNumberRef = useRef(2);

  const deviceLabels: Record<string, string> = {};
  for (const d of devices) deviceLabels[d.shortCode] = d.label;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cyd-layout")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: unknown) => {
        if (cancelled || !isLayoutConfig(data)) return;
        setConfig(data);
        // id halaman tersimpan bisa sudah "hal-3" dst — mulai counter di atas yang terpakai.
        const maxN = data.pages.reduce((max, p) => {
          const m = /^hal-(\d+)$/.exec(p.id);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 1);
        nextPageNumberRef.current = maxN + 1;
      })
      .catch(() => {
        if (!cancelled) setMessage("Gagal memuat layout tersimpan, memakai layout awal.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activePage = config.pages[activePageIndex] ?? config.pages[0];
  const usedShortCodes = activePage.cells.filter((c): c is Extract<LayoutCellOut, { printer: string }> => !("type" in c)).map((c) => c.printer);

  function updateActivePage(updates: Partial<LayoutPageOut>) {
    setConfig((cfg) => ({ ...cfg, pages: cfg.pages.map((p, i) => (i === activePageIndex ? { ...p, ...updates } : p)) }));
  }

  /**
   * Ganti cols/rows manual selalu buang `rowWeights` lama (panjangnya bisa beda dari rows baru —
   * server nolak kalau tak sama) dan membuang/menciutkan sel yang jadi keluar grid. Grid SaaS
   * kecil (2x2), jadi mengecilkan grid itu skenario nyata, beda dari dashboard 10x8.
   */
  function updateGrid(updates: { cols?: number; rows?: number }) {
    const cols = updates.cols ?? activePage.grid.cols;
    const rows = updates.rows ?? activePage.grid.rows;
    const cells = activePage.cells
      .filter((c) => c.col < cols && c.row < rows)
      .map((c) => ({
        ...c,
        colSpan: Math.min(c.colSpan ?? 1, cols - c.col),
        rowSpan: Math.min(c.rowSpan ?? 1, rows - c.row),
      }));
    setSelectedCellIndex(null);
    updateActivePage({ grid: { cols, rows }, cells });
  }

  function addCell(cell: LayoutCellOut) {
    if (activePage.cells.length >= LAYOUT_LIMITS.maxCellsPerPage) return;
    updateActivePage({ cells: [...activePage.cells, cell] });
  }

  function updateCell(index: number, cell: LayoutCellOut) {
    updateActivePage({ cells: activePage.cells.map((c, i) => (i === index ? cell : c)) });
  }

  function removeCell(index: number) {
    updateActivePage({ cells: activePage.cells.filter((_, i) => i !== index) });
    setSelectedCellIndex(null);
  }

  // Tukar posisi (col/row) dua sel terisi — ukuran (span) tetap ikut sel-nya masing-masing.
  function swapCells(indexA: number, indexB: number) {
    const a = activePage.cells[indexA];
    const b = activePage.cells[indexB];
    updateActivePage({
      cells: activePage.cells.map((c, i) => {
        if (i === indexA) return { ...a, col: b.col, row: b.row };
        if (i === indexB) return { ...b, col: a.col, row: a.row };
        return c;
      }),
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type?: string; device?: PaletteDevice; cellIndex?: number } | undefined;
    if (data?.type === "device" && data.device) setDraggingDevice(data.device);
    if (data?.type === "canvas-cell" && data.cellIndex !== undefined) setDraggingCell(activePage.cells[data.cellIndex] ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingDevice(null);
    setDraggingCell(null);
    const { active, over } = event;
    if (!over) return;
    const overData = over.data.current as { type?: string; col: number; row: number; cellIndex?: number } | undefined;
    const activeData = active.data.current as { type?: string; shortCode?: string; cellIndex?: number } | undefined;
    if (!overData || overData.type !== "cell") return;

    if (activeData?.type === "device" && activeData.shortCode) {
      if (overData.cellIndex !== undefined) return; // drop dari palette ke sel terisi: no-op
      if (usedShortCodes.includes(activeData.shortCode)) return; // dobel di halaman sama, ditolak server juga
      addCell({ printer: activeData.shortCode, col: overData.col, row: overData.row });
      return;
    }

    if (activeData?.type === "canvas-cell" && activeData.cellIndex !== undefined) {
      const fromIndex = activeData.cellIndex;
      if (overData.cellIndex !== undefined) {
        if (overData.cellIndex !== fromIndex) swapCells(fromIndex, overData.cellIndex);
      } else {
        updateCell(fromIndex, { ...activePage.cells[fromIndex], col: overData.col, row: overData.row });
      }
    }
  }

  function addPage() {
    if (config.pages.length >= LAYOUT_LIMITS.maxPages) return;
    const newPage: LayoutPageOut = {
      id: `hal-${nextPageNumberRef.current++}`,
      grid: { cols: 2, rows: 2 },
      fields: activePage.fields,
      durationSec: 5,
      cells: [],
    };
    setConfig((cfg) => ({ ...cfg, pages: [...cfg.pages, newPage] }));
    setActivePageIndex(config.pages.length);
    setSelectedCellIndex(null);
  }

  function removePage(index: number) {
    if (config.pages.length <= 1) return; // minimal 1 halaman (server juga nolak pages kosong)
    // Kalau halaman aktif yang dihapus, selectedCellIndex lama menunjuk array cells halaman lain.
    if (index === activePageIndex) setSelectedCellIndex(null);
    setConfig((cfg) => ({ ...cfg, pages: cfg.pages.filter((_, i) => i !== index) }));
    setActivePageIndex((i) => Math.max(0, i - (index <= i ? 1 : 0)));
  }

  function renamePage(index: number, newId: string) {
    setConfig((cfg) => ({ ...cfg, pages: cfg.pages.map((p, i) => (i === index ? { ...p, id: newId } : p)) }));
  }

  async function handleSave() {
    const problem = findLayoutProblem(config);
    if (problem) {
      setStatus("error");
      setMessage(problem);
      return;
    }
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/cyd-layout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStatus("error");
        setMessage(body?.reason ? `Ditolak server: ${body.reason}` : "Gagal menyimpan, coba lagi.");
        return;
      }
      setStatus("saved");
      setMessage(null);
    } catch {
      setStatus("error");
      setMessage("Gagal menyimpan, coba lagi.");
    }
  }

  const selectedCell = selectedCellIndex !== null ? activePage.cells[selectedCellIndex] ?? null : null;

  return (
    <div className="g-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">Layout CYD</h3>
          <p className="g-t4 text-[11px]">Susun halaman, tarik printer ke grid, atur ukuran sel & baris.</p>
        </div>
        <motion.button
          type="button"
          onClick={handleSave}
          disabled={status === "saving"}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="h-9 flex-shrink-0 rounded-md px-4 text-[12px] font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          style={{ background: "var(--g-accent)" }}
        >
          {status === "saving" ? "Menyimpan…" : "Simpan"}
        </motion.button>
      </div>

      {status === "saved" && !message && <p className="mb-2 text-[12px] text-emerald-600 dark:text-emerald-400">Layout tersimpan. CYD ambil versi baru saat sinkron berikutnya.</p>}
      {message && <p className={`mb-2 text-[12px] ${status === "error" ? "text-red-500" : "g-t4"}`}>{message}</p>}

      <div className="mb-3">
        <HeaderTextField
          value={config.headerText ?? ""}
          onCommit={(text) => setConfig((cfg) => ({ ...cfg, headerText: text }))}
        />
      </div>

      <div className="mb-3">
        <PageTabs
          pages={config.pages}
          activeIndex={activePageIndex}
          onSelect={(i) => {
            setActivePageIndex(i);
            setSelectedCellIndex(null);
          }}
          onAdd={addPage}
          onRemove={removePage}
          onReorder={(newPages) => setConfig((cfg) => ({ ...cfg, pages: newPages }))}
          onRename={renamePage}
        />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setDraggingDevice(null);
          setDraggingCell(null);
        }}
      >
        <div className="flex flex-wrap items-start gap-4">
          <PrinterPalette devices={devices} usedShortCodesOnActivePage={usedShortCodes} />

          <div className="min-w-0 flex-1">
            <GridCanvas
              page={activePage}
              deviceLabels={deviceLabels}
              selectedCellIndex={selectedCellIndex}
              onSelectCell={setSelectedCellIndex}
              onAddCell={addCell}
              onUpdateCell={updateCell}
              onUpdatePage={updateActivePage}
            />
          </div>

          <CellSettingsPanel
            cell={selectedCell}
            activePageId={activePage.id}
            onUpdateCell={(cell) => selectedCellIndex !== null && updateCell(selectedCellIndex, cell)}
            onRemoveCell={() => selectedCellIndex !== null && removeCell(selectedCellIndex)}
            pageFields={activePage.fields}
            onUpdatePageFields={(fields: FieldRow[]) => updateActivePage({ fields })}
            pageDurationSec={activePage.durationSec}
            onUpdateDuration={(seconds) => updateActivePage({ durationSec: seconds })}
            gridCols={activePage.grid.cols}
            gridRows={activePage.grid.rows}
            onUpdateGrid={updateGrid}
          />
        </div>

        {/* Preview yang ikut kursor — di-portal keluar pohon DOM oleh dnd-kit, jadi tak
            tersandera stacking context palette/canvas. */}
        <DragOverlay dropAnimation={null}>
          {draggingDevice && <DeviceCardPreview device={draggingDevice} />}
          {draggingCell && <CanvasCellPreview cell={draggingCell} deviceLabels={deviceLabels} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
