"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { GlassInput, HexColorPicker, type HexColorPickerOption } from "@3pb/ui";
import { InfoTip } from "./InfoTip";
import { newId } from "@/lib/id";
import { importSlicerFile } from "@/lib/kalkulator/import-3mf";
import type { FilamentEntry } from "@/lib/kalkulator/local-settings";

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
  const pickFilament = (pi: number, mi: number, filamentId: string) => {
    const f = filaments.find((x) => x.id === filamentId);
    setMat(pi, mi, f ? { filamentId: f.id, tipe: f.tipe, warnaHex: f.warnaHex } : { filamentId: undefined });
  };
  const swatchOptions = (f: FilamentEntry | undefined): HexColorPickerOption[] =>
    !f ? [] : filaments
      .filter((x) => x.brand === f.brand && x.material === f.material && x.warnaHex)
      .map((x) => ({ id: x.id, colorName: x.warna, colorHex: x.warnaHex! }));

  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File) => {
    setImportError(null);
    setImportWarnings([]);
    const draft = await importSlicerFile(file, filaments);
    if (!draft) {
      setImportError("File tidak dikenali — pastikan file .3mf/.gcode.3mf dari Bambu Studio/OrcaSlicer.");
      return;
    }
    onPlatesChange(draft.plates.map((p) => ({
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
    })));
    onBatchChange(String(draft.batch));
    setImportWarnings(draft.warnings);
  };

  // Fungsi render (bukan komponen ber-JSX-tag): dipanggil `materialRows(i)` supaya
  // elemennya di-reconcile inline di parent. Kalau dijadikan <MaterialRows/>, identitas
  // komponen dibuat ulang tiap render → subtree remount tiap ketik → input kehilangan fokus.
  const materialRows = (pi: number) => {
    const p = plates[pi];
    if (p.materials.length === 1) {
      return (
        <button type="button" onClick={() => addMat(pi)} className="text-[11px] underline self-start" style={{ color: "var(--g-accent)" }}>🎨 Multi-material</button>
      );
    }
    return (
      <div className="flex flex-col gap-1.5 pl-4 border-l-2 border-[color:var(--g-row-border)]">
        {p.materials.map((m, mi) => {
          const f = filaments.find((x) => x.id === m.filamentId);
          return (
            <div key={m.id} className="flex items-center gap-1.5">
              <select aria-label="Pilih filament" value={m.filamentId ?? ""} onChange={(e) => pickFilament(pi, mi, e.target.value)}
                className="glass-input rounded-[5px] px-2 h-9 text-[13px] flex-1 min-w-0">
                <option value="">— tarif default —</option>
                {filaments.map((x) => <option key={x.id} value={x.id}>{`${x.brand} ${x.material} ${x.warna}`}</option>)}
              </select>
              {!m.filamentId && (
                <select aria-label="Tipe material" value={m.tipe} onChange={(e) => setMat(pi, mi, { tipe: e.target.value as "FDM" | "SLA" })}
                  className="glass-input rounded-[5px] px-1.5 h-9 text-[13px] w-16 shrink-0">
                  <option value="FDM">FDM</option><option value="SLA">SLA</option>
                </select>
              )}
              <div className="relative w-[4.5rem] shrink-0">
                <GlassInput type="number" inputMode="decimal" placeholder="berat" value={m.gramasi} className="w-full px-2 pr-5"
                  onChange={(e) => setMat(pi, mi, { gramasi: e.target.value })} />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">g</span>
              </div>
              <HexColorPicker color={m.warnaHex ?? ""} options={swatchOptions(f)} onSelect={(hex) => setMat(pi, mi, { warnaHex: hex })} />
              <button type="button" aria-label="Hapus material" className="g-t4 text-sm px-1 shrink-0" onClick={() => delMat(pi, mi)}>✕</button>
            </div>
          );
        })}
        <button type="button" onClick={() => addMat(pi)} className="text-[11px] underline self-start" style={{ color: "var(--g-accent)" }}>＋ material</button>
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

  const totalGram = plates.reduce((s, p) => s + p.materials.reduce((a, m) => a + (Number(m.gramasi) || 0), 0), 0);
  const totalDurasi = plates.reduce((s, p) => s + (Number(p.durasiJam) || 0), 0);
  const batchN = Number(batch) || 1;
  const multi = plates.length > 1;
  const p0 = plates[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] g-t3 flex items-center gap-1">Bagian cetak (plate)
        <InfoTip text="Satu produk bisa terdiri dari beberapa bagian cetak. Tiap plate punya berat & durasi sendiri; totalnya dijumlahkan jadi biaya produksi." /></div>

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".3mf,.gcode.3mf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleImportFile(file);
          }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="text-[11px] underline self-start" style={{ color: "var(--g-accent)" }}>⬆ Import file slicer</button>
      </div>
      {importError && <div className="text-[11px]" style={{ color: "#ef4444" }}>{importError}</div>}
      {importWarnings.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {importWarnings.map((w, i) => (
            <div key={i} className="text-[11px] g-t4">⚠ {w}</div>
          ))}
        </div>
      )}

      {!multi ? (
        /* ── Single plate (tak diubah) ── */
        <>
          <div className="flex items-center gap-2 text-[10px] g-t4 uppercase tracking-wide">
            <span className="w-[4.75rem] shrink-0">Metode cetak</span>
            <span className="flex-1 min-w-0">Berat filament</span>
            <span className="flex-1 min-w-0">Durasi cetak</span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-[5px] border border-[color:var(--g-row-border)] p-2.5">
            {p0.nama && (
              <GlassInput value={p0.nama} placeholder="Nama part (opsional)" className="flex-1 min-w-0"
                onChange={(e) => setRow(0, { nama: e.target.value })} />
            )}
            <div className="flex items-center gap-2">
              {p0.materials.length === 1 && (
                <>
                  <select value={p0.materials[0].tipe} onChange={(e) => setMat0(0, { tipe: e.target.value as "FDM" | "SLA" })}
                    className="glass-input rounded-[5px] px-2 h-10 text-sm w-[4.75rem] shrink-0">
                    <option value="FDM">FDM</option>
                    <option value="SLA">SLA</option>
                  </select>
                  <div className="relative flex-1 min-w-0">
                    <GlassInput type="number" inputMode="decimal" placeholder="berat" value={p0.materials[0].gramasi} className="w-full min-w-0 pr-8"
                      onChange={(e) => setMat0(0, { gramasi: e.target.value })} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">g</span>
                  </div>
                </>
              )}
              <div className="relative flex-1 min-w-0">
                <GlassInput type="number" inputMode="decimal" placeholder="durasi" value={p0.durasiJam} className="w-full min-w-0 pr-9"
                  onChange={(e) => setRow(0, { durasiJam: e.target.value })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">jam</span>
              </div>
            </div>
            {!p0.nama && p0.materials.length === 1 && <div className="text-[10px] g-t5">Tipe · berat (g) · durasi (jam)</div>}
            {materialRows(0)}
          </div>
        </>
      ) : (
        /* ── Multi-plate: tabel bernomor (desktop 1 baris; mobile nama di atas, spek di bawah) ── */
        <div className="rounded-[5px] border border-[color:var(--g-row-border)]">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 pt-2.5 pb-1 text-[9px] g-t4 uppercase tracking-wide">
            <span className="w-4 shrink-0 text-center">#</span>
            <span className="flex-1 min-w-0">Nama part (utk slicer)</span>
            <span className="w-16 shrink-0">Metode</span>
            <span className="w-[4.5rem] shrink-0 text-right">Berat</span>
            <span className="w-[4.75rem] shrink-0 text-right">Durasi</span>
            <span className="w-4 shrink-0" />
          </div>
          {plates.map((p, i) => (
            <div key={p.id} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 px-2.5 py-2 border-t border-[color:var(--g-row-border)]">
              <span className="order-1 w-4 shrink-0 text-center text-[11px] g-t4" style={tnum}>{i + 1}</span>
              <GlassInput value={p.nama} placeholder="beri nama part (utk slicer)"
                className="order-2 min-w-0 basis-[calc(100%-3.25rem)] sm:basis-auto sm:flex-1"
                onChange={(e) => setRow(i, { nama: e.target.value })} />
              <button type="button" aria-label="Hapus plate" className="order-3 sm:order-6 w-4 shrink-0 g-t4 text-base leading-none"
                onClick={() => onPlatesChange(plates.filter((_, j) => j !== i))}>✕</button>
              {p.materials.length === 1 && (
                <>
                  <select value={p.materials[0].tipe} onChange={(e) => setMat0(i, { tipe: e.target.value as "FDM" | "SLA" })}
                    className="order-4 sm:order-3 glass-input rounded-[5px] px-1.5 h-10 text-[13px] w-16 shrink-0">
                    <option value="FDM">FDM</option>
                    <option value="SLA">SLA</option>
                  </select>
                  <div className="order-5 sm:order-4 relative w-[4.5rem] shrink-0">
                    <GlassInput type="number" inputMode="decimal" placeholder="berat" value={p.materials[0].gramasi} className="w-full px-2 pr-5"
                      onChange={(e) => setMat0(i, { gramasi: e.target.value })} />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">g</span>
                  </div>
                </>
              )}
              <div className="order-6 sm:order-5 relative w-[4.75rem] shrink-0">
                <GlassInput type="number" inputMode="decimal" placeholder="durasi" value={p.durasiJam} className="w-full px-2 pr-7"
                  onChange={(e) => setRow(i, { durasiJam: e.target.value })} />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">jam</span>
              </div>
              <div className="order-7 basis-full">
                {materialRows(i)}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-[color:var(--g-row-border)]">
            <span className="hidden sm:block w-4 shrink-0" />
            <span className="flex-1 min-w-0 text-[11px] g-t3 font-medium flex items-center gap-1">TOTAL 1× cetak
              <InfoTip text="Jumlah berat & durasi seluruh plate untuk sekali proses cetak. Biaya produksi dihitung dari total ini, lalu dibagi Hasil sekali cetak." /></span>
            <span className="hidden sm:block w-16 shrink-0" />
            <span className="w-[4.5rem] shrink-0 text-right text-[12px] g-t1 font-semibold" style={tnum}>{totalGram} g</span>
            <span className="w-[4.75rem] shrink-0 text-right text-[12px] g-t1 font-semibold" style={tnum}>{totalDurasi} jam</span>
            <span className="w-4 shrink-0" />
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
