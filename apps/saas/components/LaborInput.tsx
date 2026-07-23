"use client";
import { useState, useId } from "react";
import Link from "next/link";
import { GlassInput } from "@3pb/ui";
import type { LaborRow } from "@/lib/kalkulator/compose";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";
import type { LaborJob } from "@/lib/kalkulator/local-settings";

type Metode = "waktu" | "flat";
const metodeOf = (r: LaborRow): Metode =>
  r.flat != null && r.jam == null && r.ratePerJam == null ? "flat" : "waktu";
const biayaOf = (r: LaborRow) => (r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0);

export function LaborInput({
  locked, presets, labor, onChange, jobs = [], onAddJob = () => {},
}: {
  locked: boolean;
  presets: { id: string; nama: string; items: { nama: string; jam?: number; ratePerJam?: number; flat?: number }[] }[];
  labor: LaborRow[];
  onChange: (r: LaborRow[]) => void;
  jobs?: LaborJob[];
  onAddJob?: (job: { nama: string; ratePerJam?: number; flat?: number }) => void;
}) {
  if (locked) {
    return (
      <div>
        <div className="text-[12px] g-t3 font-medium">🔒 Finishing &amp; tenaga kerja</div>
        <p className="text-[11px] g-t4 mt-1">Hitung biaya perakitan, amplas, cat, dsb. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
      </div>
    );
  }
  const setRow = (i: number, patch: Partial<LaborRow>) =>
    onChange(labor.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const listId = useId();
  const [dialog, setDialog] = useState<{ i: number; nama: string } | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const findJob = (nama: string) => jobs.find((j) => j.nama.trim().toLowerCase() === nama.trim().toLowerCase());
  const rowKosong = (r: LaborRow) => r.jam == null && r.ratePerJam == null && r.flat == null;

  const onNamaChange = (i: number, nama: string) => {
    const j = findJob(nama);
    if (j && rowKosong(labor[i])) {
      setRow(i, j.ratePerJam != null ? { nama, ratePerJam: j.ratePerJam, jam: labor[i].jam ?? 1, flat: undefined } : { nama, flat: j.flat, jam: undefined, ratePerJam: undefined });
    } else {
      setRow(i, { nama });
    }
  };
  const onNamaBlur = (i: number) => {
    const r = labor[i];
    if (r.nama.trim() && !findJob(r.nama) && rowKosong(r) && !dismissed.has(r.id)) {
      setDialog({ i, nama: r.nama.trim() });
    }
  };
  // Chip metode: satu klik bolak-balik per jam ⇄ biaya tetap. Model data tetap sama.
  const toggleMetode = (i: number) => {
    const m = metodeOf(labor[i]);
    setRow(i, m === "waktu"
      ? { jam: undefined, ratePerJam: undefined, flat: labor[i].flat ?? 0 }
      : { flat: undefined, jam: labor[i].jam, ratePerJam: labor[i].ratePerJam });
  };
  const total = labor.reduce((s, r) => s + biayaOf(r), 0);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] g-t3 mb-1.5">Paket finishing cepat</div>
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onChange([...labor, ...p.items.map((it) => ({ id: newId(), nama: it.nama, jam: it.jam, ratePerJam: it.ratePerJam, flat: it.flat }))])}
              className="g-btn-ghost rounded-[5px] px-3 h-9 text-[12px] flex items-center gap-1.5">
              ＋ {p.nama} <span className="g-t4">· {p.items.length} pekerjaan</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onChange([...labor, { id: newId(), nama: "", jam: undefined, ratePerJam: undefined }])}
          className="mt-2 text-[12px] underline" style={{ color: "var(--g-accent)" }}>＋ Tambah pekerjaan custom</button>
      </div>

      {labor.length > 0 && (
        <div className="flex flex-col gap-2">
          {labor.map((r, i) => {
            const m = metodeOf(r);
            const jamNum = Number(r.jam);
            return (
              <div key={r.id} className="rounded-[5px] border border-[color:var(--g-row-border)] p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <GlassInput value={r.nama} placeholder="Nama pekerjaan (mis. Amplas)" className="flex-1 min-w-[130px]"
                    list={listId}
                    onChange={(e) => onNamaChange(i, e.target.value)}
                    onBlur={() => onNamaBlur(i)} />

                  <button type="button" onClick={() => toggleMetode(i)} aria-label="Ganti cara hitung"
                    className="g-btn-ghost rounded-[5px] h-9 px-2.5 text-[12px] shrink-0 whitespace-nowrap"
                    title="Klik untuk ganti antara per jam & biaya tetap">
                    {m === "waktu" ? "⏱ Per jam" : "Rp Tetap"}
                  </button>

                  {m === "waktu" ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="relative w-[74px]">
                        <GlassInput type="number" inputMode="decimal" placeholder="jam" value={r.jam ?? ""} className="w-full pr-8"
                          onChange={(e) => setRow(i, { jam: e.target.value === "" ? undefined : Number(e.target.value) })} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">jam</span>
                      </div>
                      <span className="g-t4 text-sm">×</span>
                      <div className="relative w-[120px]">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">Rp</span>
                        <GlassInput type="number" inputMode="decimal" placeholder="tarif" value={r.ratePerJam ?? ""} className="w-full pl-7 pr-9"
                          onChange={(e) => setRow(i, { ratePerJam: e.target.value === "" ? undefined : Number(e.target.value) })} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">/jam</span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative w-[140px] shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">Rp</span>
                      <GlassInput type="number" inputMode="decimal" placeholder="biaya" value={r.flat ? String(r.flat) : ""} className="w-full pl-7"
                        onChange={(e) => setRow(i, { flat: e.target.value === "" ? 0 : Number(e.target.value) })} />
                    </div>
                  )}

                  <span className="ml-auto text-[13px] font-semibold shrink-0" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{rupiah(biayaOf(r))}</span>
                  <button type="button" aria-label="Hapus pekerjaan" className="g-t4 text-base px-1 shrink-0 leading-none"
                    onClick={() => onChange(labor.filter((_, j) => j !== i))}>✕</button>
                </div>
                {m === "waktu" && Number.isFinite(jamNum) && jamNum > 0 && (
                  <div className="text-[10px] g-t4 mt-1 pl-0.5">{String(r.jam).replace(".", ",")} jam = {Math.round(jamNum * 60)} menit</div>
                )}
              </div>
            );
          })}
          <div className="text-[11px] g-t4 text-right pt-0.5">Subtotal finishing: <span className="g-t2 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(total)}</span></div>
        </div>
      )}

      <datalist id={listId}>
        {jobs.map((j) => <option key={j.id} value={j.nama} />)}
      </datalist>

      {dialog && (
        <NewJobDialog
          nama={dialog.nama}
          onCancel={() => { setDismissed((s) => new Set(s).add(labor[dialog.i].id)); setDialog(null); }}
          onSave={(patch) => {
            onAddJob({ nama: dialog.nama, ...patch });
            setRow(dialog.i, patch.ratePerJam != null ? { ratePerJam: patch.ratePerJam, jam: labor[dialog.i].jam ?? 1, flat: undefined } : { flat: patch.flat, jam: undefined, ratePerJam: undefined });
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function NewJobDialog({ nama, onSave, onCancel }: {
  nama: string;
  onSave: (patch: { ratePerJam?: number; flat?: number }) => void;
  onCancel: () => void;
}) {
  const [metode, setMetode] = useState<"waktu" | "flat">("waktu");
  const [nilai, setNilai] = useState("");
  const id = useId();
  const n = Number(nilai);
  const valid = Number.isFinite(n) && n >= 0 && nilai !== "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-[5px] p-4 modal-surface flex flex-col gap-3"
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
        <div className="text-sm font-semibold g-t1">Pekerjaan baru: {nama}</div>
        <p className="text-[11px] g-t4">Set tarifnya sekali, nanti otomatis terpakai lagi.</p>
        <div className="flex gap-1">
          {(["waktu", "flat"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMetode(m)}
              className="g-btn-ghost rounded-[5px] px-2.5 h-8 text-[12px]"
              style={metode === m ? { outline: "2px solid var(--g-accent)", color: "var(--g-accent)" } : undefined}>
              {m === "waktu" ? "⏱ Per jam" : "Rp Tetap"}
            </button>
          ))}
        </div>
        <label className="text-[11px] g-t3 flex flex-col gap-1">
          <span>{metode === "waktu" ? "Tarif per jam (Rp)" : "Biaya tetap (Rp)"}</span>
          <GlassInput id={id} aria-label="Tarif" type="number" inputMode="decimal" value={nilai} autoFocus
            onChange={(e) => setNilai(e.target.value)} />
        </label>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="g-btn-ghost rounded-[5px] h-9 px-3 text-[12px]">Nanti</button>
          <button type="button" disabled={!valid}
            onClick={() => onSave(metode === "waktu" ? { ratePerJam: n } : { flat: n })}
            className="rounded-[5px] h-9 px-3 text-[12px] font-medium text-white disabled:opacity-40"
            style={{ background: "var(--g-accent)" }}>Simpan &amp; pakai</button>
        </div>
      </div>
    </div>
  );
}
