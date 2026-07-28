"use client";

import { useState } from "react";
import { LAYOUT_LIMITS, type FieldRow, type LayoutCellOut } from "@3pb/cyd-layout-schema";

/**
 * Preset field HARDCODE (beda dari dashboard yang fetch tabel `CydFieldPreset`): di SaaS belum
 * ada UI/tabel preset per-user, dan dua bentuk ini menutup kebutuhan customer 1-3 printer.
 *
 * Catatan batas firmware: "Detail" punya 4 baris, sedangkan override per-SEL dibatasi
 * `maxRowsPerFieldsCellOverride` (3) — jadi "Detail" cuma legal sebagai default HALAMAN
 * (`page.fields`, batas 8 baris). Dropdown per-sel di bawah karena itu memfilter preset yang
 * kepanjangan, persis seperti `cellOverridePresets` di dashboard.
 */
export const FIELD_PRESETS: { name: string; fields: FieldRow[] }[] = [
  { name: "Ringkas", fields: [["name"], ["state"]] },
  { name: "Detail", fields: [["name"], ["state"], ["progress"], ["timeLeft"]] },
];

// Batas kolom cuma sanity check editor (firmware bagi lebar layar / cols, tak ada array tetap).
// Batas baris WAJIB <= LAYOUT_LIMITS.maxGridRows — firmware nolak config kalau lebih.
const GRID_COLS_RANGE = { min: 1, max: 8 };
const GRID_ROWS_RANGE = { min: 1, max: LAYOUT_LIMITS.maxGridRows };

function presetNameOf(fields: FieldRow[] | undefined): string {
  if (!fields || fields.length === 0) return "";
  const found = FIELD_PRESETS.find((p) => JSON.stringify(p.fields) === JSON.stringify(fields));
  return found?.name ?? "";
}

/** Input teks label dengan state lokal supaya peringatan panjang muncul saat mengetik. */
function LabelTextField({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
  const [text, setText] = useState(value);
  const tooLong = text.length > LAYOUT_LIMITS.maxLabelTextLength;
  return (
    <label className="g-t2 block text-xs">
      Teks label
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
      />
      {tooLong && (
        <span className="mt-1 block text-[10px] leading-relaxed text-red-500">
          Maks {LAYOUT_LIMITS.maxLabelTextLength} karakter (sekarang {text.length}) — simpan akan ditolak.
        </span>
      )}
    </label>
  );
}

export function CellSettingsPanel({
  cell,
  activePageId,
  onUpdateCell,
  onRemoveCell,
  pageFields,
  onUpdatePageFields,
  pageDurationSec,
  onUpdateDuration,
  gridCols,
  gridRows,
  onUpdateGrid,
}: {
  cell: LayoutCellOut | null;
  activePageId: string;
  onUpdateCell: (cell: LayoutCellOut) => void;
  onRemoveCell: () => void;
  pageFields: FieldRow[];
  onUpdatePageFields: (fields: FieldRow[]) => void;
  pageDurationSec: number;
  onUpdateDuration: (seconds: number) => void;
  gridCols: number;
  gridRows: number;
  onUpdateGrid: (updates: { cols?: number; rows?: number }) => void;
}) {
  const cellOverridePresets = FIELD_PRESETS.filter((p) => p.fields.length <= LAYOUT_LIMITS.maxRowsPerFieldsCellOverride);
  const isLabel = cell !== null && "type" in cell;

  // Copy-on-select (bukan referensi by-id): `fields` disalin ke dalam cell/page, sama seperti
  // dashboard — config yang dikirim ke firmware harus self-contained.
  function handleCellPresetChange(name: string) {
    if (!cell || "type" in cell) return;
    if (name === "") {
      const next = { ...cell };
      delete next.fields;
      onUpdateCell(next);
      return;
    }
    const preset = cellOverridePresets.find((p) => p.name === name);
    if (!preset) return;
    onUpdateCell({ ...cell, fields: preset.fields.map((row) => [...row]) });
  }

  function handlePagePresetChange(name: string) {
    if (name === "") {
      onUpdatePageFields([]);
      return;
    }
    const preset = FIELD_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    onUpdatePageFields(preset.fields.map((row) => [...row]));
  }

  /**
   * Identitas unik sel terpilih — dipakai sebagai React key supaya input yang punya state lokal
   * (teks label) remount & baca ulang nilainya saat seleksi berpindah. `activePageId` dilipat ke
   * key karena dua halaman bisa punya sel di koordinat yang sama.
   */
  function selectedCellKey(): string {
    if (!cell) return "none";
    if ("type" in cell) return `label-${activePageId}-${cell.col}-${cell.row}`;
    return `printer-${activePageId}-${cell.col}-${cell.row}-${cell.printer}`;
  }

  return (
    <div className="w-48 flex-shrink-0 space-y-3">
      <div className="g-card rounded-2xl p-3 backdrop-blur-[12px]">
        <div className="mb-2 flex items-center justify-between">
          <span className="g-t3 text-[10px] font-semibold uppercase tracking-[0.14em]">Sel Terpilih</span>
          {cell && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                isLabel ? "bg-amber-500/12 text-amber-600 dark:text-amber-300" : "bg-indigo-500/12 text-indigo-500 dark:text-indigo-300"
              }`}
            >
              {isLabel ? "Label" : "Printer"}
            </span>
          )}
        </div>

        <div key={selectedCellKey()} className="page-enter">
          {!cell && (
            <div className="rounded-xl border border-dashed px-2 py-5 text-center" style={{ borderColor: "var(--g-dashed)" }}>
              <div className="mb-1 text-lg">👆</div>
              <p className="g-t3 text-[11px] leading-relaxed">Klik sel di canvas untuk mengatur</p>
            </div>
          )}

          {cell && !("type" in cell) && (
            <div className="space-y-2.5">
              <p className="g-t2 truncate font-mono text-xs">{cell.printer}</p>
              <label className="g-t2 block text-xs">
                Field preset sel
                <select
                  className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
                  value={presetNameOf(cell.fields)}
                  onChange={(e) => handleCellPresetChange(e.target.value)}
                >
                  <option value="">Ikut halaman</option>
                  {cellOverridePresets.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {FIELD_PRESETS.length > cellOverridePresets.length && (
                  <span className="g-t4 mt-1 block text-[10px] leading-relaxed">
                    Preset dengan lebih dari {LAYOUT_LIMITS.maxRowsPerFieldsCellOverride} baris cuma bisa jadi default halaman, bukan per-sel (batas firmware).
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={onRemoveCell}
                className="w-full rounded-[5px] border border-red-500/25 bg-red-500/5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
              >
                Hapus dari grid
              </button>
            </div>
          )}

          {cell && "type" in cell && (
            <div className="space-y-2.5">
              <LabelTextField value={cell.text} onCommit={(text) => onUpdateCell({ ...cell, text })} />
              <button
                type="button"
                onClick={onRemoveCell}
                className="w-full rounded-[5px] border border-red-500/25 bg-red-500/5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
              >
                Hapus dari grid
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="g-card rounded-2xl p-3 backdrop-blur-[12px]">
        <div className="g-t3 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em]">Halaman</div>

        <label className="g-t2 block text-xs">
          Field preset halaman
          <select
            className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
            value={presetNameOf(pageFields)}
            onChange={(e) => handlePagePresetChange(e.target.value)}
          >
            <option value="">Bawaan firmware</option>
            {FIELD_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="g-t2 mt-2.5 block text-xs">
          Durasi rotasi (detik, 0 = statis)
          <input
            key={`dur-${activePageId}-${pageDurationSec}`}
            type="number"
            min={0}
            defaultValue={pageDurationSec}
            onBlur={(e) => onUpdateDuration(Math.max(0, Number(e.target.value) || 0))}
            className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
          />
        </label>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <label className="g-t2 block text-xs">
            Kolom
            <input
              key={`cols-${activePageId}-${gridCols}`}
              type="number"
              min={GRID_COLS_RANGE.min}
              max={GRID_COLS_RANGE.max}
              defaultValue={gridCols}
              onBlur={(e) => {
                const clamped = Math.min(GRID_COLS_RANGE.max, Math.max(GRID_COLS_RANGE.min, Number(e.target.value) || gridCols));
                onUpdateGrid({ cols: clamped });
              }}
              className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
            />
          </label>
          <label className="g-t2 block text-xs">
            Baris
            <input
              key={`rows-${activePageId}-${gridRows}`}
              type="number"
              min={GRID_ROWS_RANGE.min}
              max={GRID_ROWS_RANGE.max}
              defaultValue={gridRows}
              onBlur={(e) => {
                const clamped = Math.min(GRID_ROWS_RANGE.max, Math.max(GRID_ROWS_RANGE.min, Number(e.target.value) || gridRows));
                onUpdateGrid({ rows: clamped });
              }}
              className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
            />
          </label>
        </div>
        <p className="g-t4 mt-1.5 text-[10px] leading-relaxed">
          Maks {GRID_ROWS_RANGE.max} baris (batas firmware). Ubah ukuran mereset penyesuaian tinggi baris manual.
        </p>
      </div>
    </div>
  );
}
