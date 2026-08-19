"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GlassInput } from "@3pb/ui";
import { InfoTip } from "./InfoTip";
import { newId } from "@/lib/id";
import { importSlicerFile } from "@/lib/kalkulator/import-3mf";
import type { ImportDraft } from "@/lib/kalkulator/import-3mf/build-draft";
import { mergeImportedPlates } from "@/lib/kalkulator/import-3mf/merge-plates";
import type { FilamentEntry } from "@/lib/kalkulator/local-settings";

// input type="color" HTML cuma nerima format #rrggbb persis 6 digit — beda dgn
// validasi longgar di @3pb/ui isValidHexColor (3-8 digit), jadi cek sendiri di sini.
function isStrictHex6(s: string | undefined): s is string {
  return !!s && /^#[0-9a-fA-F]{6}$/.test(s.trim());
}

// Terima input "H:MM" (mis. "1:45") ATAU angka jam desimal biasa (mis. "1.75") —
// dikonversi ke desimal cuma saat blur (bukan tiap keystroke) supaya user bisa
// ngetik ":" tanpa field-nya berubah sendiri di tengah ketikan.
function parseDurasi(raw: string): string {
  const trimmed = raw.trim();
  const hhmm = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (!hhmm) return trimmed;
  const jam = Number(hhmm[1]);
  const menit = Number(hhmm[2]);
  return String(Math.round((jam + menit / 60) * 100) / 100);
}

/** Hint "3j" / "8j 34m" ditampilkan di kanan input durasi — murni display,
 *  tak pernah ditulis balik ke state (durasiJam tetap desimal jam apa adanya). */
function formatDurasiDisplay(jam: number): string {
  if (!jam) return "";
  const h = Math.floor(jam);
  const m = Math.round((jam - h) * 60);
  return m === 0 ? `${h}j` : `${h}j ${m}m`;
}

function DurasiInput({ value, onCommit, className }: { value: string; onCommit: (v: string) => void; className?: string }) {
  const [draft, setDraft] = useState(value);
  // Resyncs local editable draft when the committed `value` prop changes elsewhere;
  // draft otherwise diverges freely from the prop while the user is typing.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(value), [value]);
  const hint = formatDurasiDisplay(Number(value) || 0);
  return (
    <div className="relative">
      <GlassInput
        type="text"
        placeholder="jam atau H:MM"
        value={draft}
        className={`${className ?? ""} pr-14`.trim()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = parseDurasi(draft);
          setDraft(parsed);
          if (parsed !== value) onCommit(parsed);
        }}
      />
      {hint && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none" style={{ color: "var(--g-accent)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export interface PlateMaterial {
  id: string;
  filamentId?: string;
  tipe: "FDM" | "SLA";
  gramasi: string;
  warnaHex?: string;
}

export interface PlateRow {
  id: string;
  nama: string;
  durasiJam: string;
  materials: PlateMaterial[];
}

export function newPlateMaterial(): PlateMaterial {
  return { id: newId(), tipe: "FDM", gramasi: "" };
}

export function newPlateRow(): PlateRow {
  return { id: newId(), nama: "", durasiJam: "", materials: [newPlateMaterial()] };
}

const tnum = { fontVariantNumeric: "tabular-nums" as const };

export function PlateInput({
  locked, plates, batch, filaments = [], onPlatesChange, onBatchChange,
}: {
  locked: boolean;
  plates: PlateRow[];
  batch: string;
  filaments?: FilamentEntry[];
  onPlatesChange: (p: PlateRow[]) => void;
  onBatchChange: (b: string) => void;
}) {
  const setRow = (i: number, patch: Partial<PlateRow>) =>
    onPlatesChange(plates.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setMat0 = (i: number, patch: Partial<PlateMaterial>) =>
    onPlatesChange(plates.map((p, j) => (j === i ? { ...p, materials: p.materials.map((m, k) => (k === 0 ? { ...m, ...patch } : m)) } : p)));
  const setMat = (pi: number, mi: number, patch: Partial<PlateMaterial>) =>
    onPlatesChange(plates.map((p, j) => (j === pi ? { ...p, materials: p.materials.map((m, k) => (k === mi ? { ...m, ...patch } : m)) } : p)));
  const addMat = (pi: number) =>
    onPlatesChange(plates.map((p, j) => (j === pi ? { ...p, materials: [...p.materials, newPlateMaterial()] } : p)));
  const delMat = (pi: number, mi: number) =>
    onPlatesChange(plates.map((p, j) => {
      if (j !== pi) return p;
      const rest = p.materials.filter((_, k) => k !== mi);
      // Kembali ke single-material: mode single cuma punya kontrol tipe (bukan katalog),
      // jadi bersihkan filamentId/warnaHex supaya harga ikut tipe yang tampil (bukan
      // filament katalog tersembunyi yang tak bisa lagi diubah user).
      const materials = rest.length === 1 ? [{ ...rest[0], filamentId: undefined, warnaHex: undefined }] : rest;
      return { ...p, materials };
    }));
  // Toggle 1-klik: dari 1 material → tambah 1 (mulai multi); dari >1 material →
  // ciutkan balik ke 1 (buang sisanya, bersihkan filamentId/warnaHex spt delMat).
  const toggleMulti = (pi: number) =>
    onPlatesChange(plates.map((p, j) => {
      if (j !== pi) return p;
      if (p.materials.length === 1) return { ...p, materials: [...p.materials, newPlateMaterial()] };
      const first = p.materials[0];
      return { ...p, materials: [{ ...first, filamentId: undefined, warnaHex: undefined }] };
    }));
  const pickFilament = (pi: number, mi: number, filamentId: string) => {
    const f = filaments.find((x) => x.id === filamentId);
    setMat(pi, mi, f ? { filamentId: f.id, tipe: f.tipe, warnaHex: f.warnaHex } : { filamentId: undefined });
  };

  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFiles = async (files: File[]) => {
    setImportError(null);
    setImportWarnings([]);
    const drafts: ImportDraft[] = [];
    const failed: string[] = [];
    for (const file of files) {
      const draft = await importSlicerFile(file, filaments);
      if (draft) drafts.push(draft);
      else failed.push(file.name);
    }
    if (failed.length > 0) {
      setImportError(`File tidak dikenali: ${failed.join(", ")} — pastikan file .3mf/.gcode.3mf dari Bambu Studio/OrcaSlicer.`);
    }
    if (drafts.length === 0) return;
    const importedRows: PlateRow[] = drafts.flatMap((draft) =>
      draft.plates.map((p) => ({
        id: newId(),
        nama: p.nama,
        durasiJam: String(p.durasiJam),
        materials: p.materials.map((m) => ({
          id: newId(),
          filamentId: m.filamentId,
          tipe: m.tipe,
          gramasi: String(m.gramasi),
          warnaHex: m.warnaHex,
        })),
      })),
    );
    // Append semantics: importing more files adds plates; pristine placeholder
    // rows are dropped, and batch only follows the file when nothing was filled yet.
    const { plates: merged, wasPristine } = mergeImportedPlates(plates, importedRows);
    onPlatesChange(merged);
    if (wasPristine) onBatchChange(String(drafts[0].batch));
    // Dedupe: identical unmatched-filament warnings repeat across plates/files —
    // show each unique message once.
    setImportWarnings([...new Set(drafts.flatMap((d) => d.warnings))]);
  };

  const multiToggleBtn = (pi: number, isMulti: boolean) => (
    <button
      type="button"
      onClick={() => toggleMulti(pi)}
      className="h-9 px-2.5 rounded-[5px] text-[11px] font-semibold shrink-0 border"
      style={isMulti
        ? { background: "color-mix(in srgb, var(--g-accent) 22%, transparent)", borderColor: "color-mix(in srgb, var(--g-accent) 50%, transparent)", color: "var(--g-accent)" }
        : { background: "var(--g-row-hover, transparent)", borderColor: "var(--g-row-border)", color: "var(--g-t3)" }}
      title={isMulti ? "Kembali ke 1 material" : "Tambah material lain (multi-material)"}
    >
      {isMulti ? "✕ Multi" : "🎨 Multi"}
    </button>
  );

  // Fungsi render (bukan komponen ber-JSX-tag): dipanggil `materialRows(i)` supaya
  // elemennya di-reconcile inline di parent. Kalau dijadikan <MaterialRows/>, identitas
  // komponen dibuat ulang tiap render → subtree remount tiap ketik → input kehilangan fokus.
  // Selalu render 1+ kartu material (bukan cuma pas multi) — tombol toggle Multi di atas
  // (lihat multiToggleBtn) yang mengatur jumlah materialnya, bukan fungsi ini.
  const materialRows = (pi: number) => {
    const p = plates[pi];
    const isMulti = p.materials.length > 1;
    const totalGram = p.materials.reduce((s, m) => s + (Number(m.gramasi) || 0), 0);
    return (
      <div className="flex flex-col gap-1.5">
        {p.materials.map((m, mi) => {
          return (
            <div key={m.id} className="rounded-[5px] border border-[color:var(--g-row-border)] p-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <select aria-label="Pilih filament" value={m.filamentId ?? ""} onChange={(e) => pickFilament(pi, mi, e.target.value)}
                  className="rounded-[5px] px-2 h-9 text-[12px] font-semibold flex-1 min-w-0 border"
                  style={m.filamentId
                    ? { background: "color-mix(in srgb, var(--g-accent) 14%, transparent)", borderColor: "color-mix(in srgb, var(--g-accent) 32%, transparent)", color: "var(--g-accent)" }
                    : { background: "transparent", borderColor: "var(--g-row-border)", color: "var(--g-t3)" }}>
                  <option value="">— tarif default —</option>
                  {filaments.map((x) => <option key={x.id} value={x.id}>{`🧵 ${x.brand} · ${x.material} · ${x.warna} · Rp${x.hppPerGram}/g`}</option>)}
                </select>
                {isMulti && (
                  <button type="button" aria-label="Hapus material" className="g-t4 text-sm px-1 shrink-0" onClick={() => delMat(pi, mi)}>✕</button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <select aria-label="Tipe material" value={m.tipe} disabled={!!m.filamentId}
                  onChange={(e) => setMat(pi, mi, { tipe: e.target.value as "FDM" | "SLA" })}
                  className="glass-input rounded-[5px] px-2 h-9 text-[12px] flex-1 min-w-0 disabled:opacity-60">
                  <option value="FDM">FDM</option>
                  <option value="SLA">SLA</option>
                </select>
                <input type="color" aria-label="Pilih warna" title="Pilih warna"
                  value={isStrictHex6(m.warnaHex) ? m.warnaHex : "#888888"}
                  onChange={(e) => setMat(pi, mi, { warnaHex: e.target.value })}
                  className="w-9 h-9 shrink-0 rounded-[5px] border border-[color:var(--g-row-border)] cursor-pointer bg-transparent p-0.5" />
                <GlassInput value={m.warnaHex ?? ""} placeholder="#RRGGBB" aria-label="Kode warna hex"
                  className="w-[5.5rem] shrink-0 px-2 text-[11px] font-mono"
                  onChange={(e) => setMat(pi, mi, { warnaHex: e.target.value })} />
                <div className="relative w-[4.5rem] shrink-0">
                  <GlassInput type="number" inputMode="decimal" placeholder="berat" value={m.gramasi} className="w-full px-2 pr-5"
                    onChange={(e) => setMat(pi, mi, { gramasi: e.target.value })} />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">g</span>
                </div>
              </div>
            </div>
          );
        })}
        {isMulti && (
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => addMat(pi)} className="text-[12px] font-medium" style={{ color: "var(--g-accent)" }}>＋ Tambah material</button>
            <span className="text-[11px] font-semibold" style={{ color: "var(--g-accent)" }}>Total: {totalGram}g</span>
          </div>
        )}
      </div>
    );
  };

  if (locked) {
    const p = plates[0];
    return (
      <div className="flex flex-col gap-3">
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Berat (gram)
            <InfoTip text="Berat total produk yang dicetak. Dikali harga material per gram untuk jadi Biaya modal." /></span>
          <GlassInput type="number" inputMode="decimal" value={p.materials[0].gramasi}
            onChange={(e) => setMat0(0, { gramasi: e.target.value })} className="w-full mt-1" />
        </label>
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Durasi print (jam)
            <InfoTip text="Lama cetak menurut slicer. Dikali Biaya mesin/jam (listrik + depresiasi + maintenance)." /></span>
          <GlassInput type="number" inputMode="decimal" value={p.durasiJam}
            onChange={(e) => setRow(0, { durasiJam: e.target.value })} className="w-full mt-1" />
        </label>
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Jenis filament
            <InfoTip text="Menentukan tarif material yang dipakai: FDM pakai harga filament, SLA pakai harga resin." /></span>
          <select value={p.materials[0].tipe} onChange={(e) => setMat0(0, { tipe: e.target.value as "FDM" | "SLA" })}
            className="glass-input rounded-[5px] px-3 h-10 text-sm w-full mt-1">
            <option value="FDM">FDM (PLA/PETG)</option>
            <option value="SLA">SLA (Resin)</option>
          </select>
        </label>
        <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1">
          <div className="text-[12px] g-t3 font-medium">🔒 Multi-plate &amp; batch</div>
          <p className="text-[11px] g-t4 mt-1">Produk multi-bagian (tiap part berat &amp; durasi sendiri) dan banyak pcs sekali cetak. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
        </div>
      </div>
    );
  }

  // Dibulatkan 2 desimal saat tampil — angka slicer asli (mis. 0.1+0.2) bisa menumpuk
  // sisa floating-point (contoh nyata: total durasi tampil "27.119999999999997 jam").
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const totalGram = round2(plates.reduce((s, p) => s + p.materials.reduce((a, m) => a + (Number(m.gramasi) || 0), 0), 0));
  const totalDurasi = round2(plates.reduce((s, p) => s + (Number(p.durasiJam) || 0), 0));
  const batchN = Number(batch) || 1;
  const multi = plates.length > 1;
  const p0 = plates[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] g-t3 flex items-center gap-1">Bagian cetak (plate)
        <InfoTip text="Satu produk bisa terdiri dari beberapa bagian cetak. Tiap plate punya berat & durasi sendiri; totalnya dijumlahkan jadi biaya produksi." /></div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".3mf,.gcode.3mf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void handleImportFiles(files);
        }}
      />
      <button type="button" onClick={() => fileInputRef.current?.click()}
        className="w-full rounded-[5px] border border-[color:var(--g-row-border)] py-2.5 text-[13px] font-medium text-center"
        style={{ color: "var(--g-accent)" }}>⬆ Import file slicer</button>
      {importError && <div className="text-[11px] g-error">{importError}</div>}
      {importWarnings.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {importWarnings.map((w, i) => (
            <div key={i} className="text-[11px] g-t4">⚠ {w}</div>
          ))}
        </div>
      )}

      {!multi ? (
        /* ── Single plate ── */
        <div className="flex flex-col gap-1.5 rounded-[5px] border border-[color:var(--g-row-border)] p-2.5">
          <div className="flex items-center gap-2">
            <GlassInput value={p0.nama} placeholder="Nama part (opsional)" className="flex-1 min-w-0"
              onChange={(e) => setRow(0, { nama: e.target.value })} />
            {multiToggleBtn(0, p0.materials.length > 1)}
          </div>

          <div className="text-[10px] g-t4 uppercase tracking-wide font-semibold pt-1">Durasi</div>
          <DurasiInput value={p0.durasiJam} onCommit={(v) => setRow(0, { durasiJam: v })} className="w-full" />

          <div className="text-[10px] g-t4 uppercase tracking-wide font-semibold pt-1">Material &amp; warna</div>
          {materialRows(0)}
        </div>
      ) : (
        /* ── Multi-plate: satu kartu per plate (nomor + nama + toggle multi + durasi + material) ── */
        <div className="flex flex-col gap-2">
          {plates.map((p, i) => (
            <div key={p.id} className="rounded-[5px] border border-[color:var(--g-row-border)] p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-center text-[11px] g-t4" style={tnum}>{i + 1}</span>
                <GlassInput value={p.nama} placeholder="beri nama part (utk slicer)" className="flex-1 min-w-0"
                  onChange={(e) => setRow(i, { nama: e.target.value })} />
                {multiToggleBtn(i, p.materials.length > 1)}
                <button type="button" aria-label="Hapus plate" className="w-8 h-9 shrink-0 g-t4 text-base leading-none rounded-[5px] border border-[color:var(--g-row-border)]"
                  onClick={() => onPlatesChange(plates.filter((_, j) => j !== i))}>✕</button>
              </div>
              <DurasiInput value={p.durasiJam} onCommit={(v) => setRow(i, { durasiJam: v })} className="w-full" />
              {materialRows(i)}
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-1">
            <span className="flex-1 min-w-0 text-[11px] g-t3 font-medium flex items-center gap-1">TOTAL 1× cetak
              <InfoTip text="Jumlah berat & durasi seluruh plate untuk sekali proses cetak. Biaya produksi dihitung dari total ini, lalu dibagi Hasil sekali cetak." /></span>
            <span className="text-[12px] g-t1 font-semibold" style={tnum}>{totalGram} g</span>
            <span className="text-[12px] g-t1 font-semibold" style={tnum}>{totalDurasi} jam</span>
          </div>
        </div>
      )}

      <button type="button" onClick={() => onPlatesChange([...plates, newPlateRow()])}
        className="text-[12px] underline text-left self-start" style={{ color: "var(--g-accent)" }}>＋ tambah plate</button>

      <label className="text-[12px] g-t3 flex flex-col">
        <span className="flex items-center gap-1">Hasil sekali cetak</span>
        <span className="text-[11px] g-t4 mb-1">Berapa produk yang dihasilkan dari sekali proses cetak di atas?</span>
        <GlassInput type="number" inputMode="numeric" min={1} value={batch} className="w-28"
          onChange={(e) => onBatchChange(e.target.value)} />
      </label>

      {multi && batchN > 1 && (
        <div className="text-[11px] g-t4">per pcs = total produksi ÷ {batchN}</div>
      )}
    </div>
  );
}
