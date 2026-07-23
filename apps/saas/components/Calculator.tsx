"use client";
import { useEffect, useState } from "react";
import type { MarginTier } from "@3pb/kalkulator-core";
import { fullView, type CalcPlate } from "@/lib/kalkulator/compute";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings } from "@/lib/store/local-settings";
import { getRincianPref } from "@/lib/store/display-prefs";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";
import { CalcSection } from "./CalcSection";
import { PlateInput, type PlateRow } from "./PlateInput";
import { KomponenInput } from "./KomponenInput";
import { LaborInput } from "./LaborInput";
import { PackingInput } from "./PackingInput";
import { ResultPanel } from "./ResultPanel";
import { MobileSummaryBar } from "./MobileSummaryBar";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";

const INITIAL_PLATES: PlateRow[] = [{ id: "plate-1", nama: "", durasiJam: "3", materials: [{ id: "m1", tipe: "FDM", gramasi: "50" }] }];

export function Calculator({ paidCore = false, userId = null }: { paidCore?: boolean; userId?: string | null }) {
  const [plates, setPlates] = useState<PlateRow[]>(INITIAL_PLATES);
  const [batch, setBatch] = useState("1");
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [komponen, setKomponen] = useState<KomponenRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [packing, setPacking] = useState<{ nama: string; harga: number } | undefined>(undefined);
  const [channel, setChannel] = useState("offline");
  const [tier, setTier] = useState<MarginTier>("B");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showRincian, setShowRincian] = useState(true);

  useEffect(() => {
    if (paidCore && userId) loadSettings(userId).then(setSettings);
  }, [paidCore, userId]);

  useEffect(() => { setShowRincian(getRincianPref()); }, []);

  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, durasiJam: Number(p.durasiJam),
    materials: p.materials.map((m) => ({ filamentId: m.filamentId, tipe: m.tipe, gramasi: Number(m.gramasi) })),
  });
  const valid = plates.length > 0 && plates.every(
    (p) => Number(p.durasiJam) > 0 && p.materials.length > 0 && p.materials.every((m) => Number(m.gramasi) > 0),
  );
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid
    ? fullView({ plates: plates.map(toCalcPlate), batch: paidCore ? Number(batch) : 1, ...addon }, settings)
    : null;

  const onReset = () => {
    setPlates(INITIAL_PLATES); setBatch("1"); setKomponen([]); setLabor([]); setPacking(undefined);
    setChannel("offline"); setTier("B");
  };
  const onCopy = () => {
    if (view) navigator.clipboard?.writeText(String(view.strategi[channel]?.[tier]?.harga ?? "")).catch(() => {});
  };
  const onAddJob = (job: { nama: string; ratePerJam?: number; flat?: number }) => {
    if (settings.laborJobs.some((j) => j.nama.trim().toLowerCase() === job.nama.trim().toLowerCase())) return;
    const next = { ...settings, laborJobs: [...settings.laborJobs, { id: newId(), ...job }] };
    setSettings(next);
    if (paidCore && userId) saveSettings(userId, next).catch(() => {});
  };

  const r = view?.rincian;
  const hasil = Math.max(1, Number(batch) || 1);

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(350px,410px)] gap-5 items-start pb-24 lg:pb-0">
      {/* Kolom kiri: form section */}
      <div className="flex flex-col gap-4 min-w-0">
        <CalcSection n={1} title="Produksi (Cetak 3D)" subtitle="Biaya material dan waktu cetak" icon="🖨️"
          subtotalLabel="Subtotal per produk" subtotal={r?.produksi}>
          <PlateInput locked={!paidCore} plates={plates} batch={batch} filaments={settings.filaments} onPlatesChange={setPlates} onBatchChange={setBatch} />
          {paidCore && (
            <div className="mt-3 rounded-[5px] p-3 flex gap-2 text-[11px] g-t3 leading-relaxed"
              style={{ background: "color-mix(in srgb, var(--g-accent) 6%, transparent)" }}>
              <span className="shrink-0">ℹ️</span>
              <span>Angka di atas = jumlah produk yang dihasilkan dari 1 proses cetak. Biaya produksi dibagi angka ini.</span>
            </div>
          )}
          {view && (
            <div className="mt-3 grid grid-cols-3 rounded-[5px] border" style={{ borderColor: "var(--g-row-border)" }}>
              <div className="p-3">
                <div className="text-[10px] g-t4">Biaya per proses cetak</div>
                <div className="text-[15px] font-bold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(r!.produksi * hasil)}</div>
              </div>
              <div className="p-3" style={{ borderLeft: "1px solid var(--g-row-border)" }}>
                <div className="text-[10px] g-t4">Hasil per proses</div>
                <div className="text-[15px] font-bold g-t1">{hasil} pcs</div>
              </div>
              <div className="p-3" style={{ borderLeft: "1px solid var(--g-row-border)" }}>
                <div className="text-[10px] g-t4">Biaya per produk</div>
                <div className="text-[15px] font-bold" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{rupiah(r!.produksi)}</div>
              </div>
            </div>
          )}
        </CalcSection>

        <CalcSection n={2} title="Komponen tambahan" subtitle="Komponen yang dipasang pada produk" icon="🧩"
          subtotal={paidCore ? (r?.komponen ?? 0) : undefined}
          summary={komponen.length ? `${komponen.length} item · ${rupiah(r?.komponen ?? 0)}` : "Belum ada"}>
          <KomponenInput locked={!paidCore} presets={settings.komponenPresets} komponen={komponen} onChange={setKomponen} />
        </CalcSection>

        <CalcSection n={3} title="Finishing & tenaga kerja" subtitle="Perakitan, pengamplasan, pengecatan, dll." icon="🛠️"
          subtotal={paidCore ? (r?.labor ?? 0) : undefined}
          summary={labor.length ? `${labor.length} pekerjaan · ${rupiah(r?.labor ?? 0)}` : "Belum ada"}>
          <LaborInput locked={!paidCore} presets={settings.laborPresets} labor={labor} onChange={setLabor}
            jobs={settings.laborJobs} onAddJob={onAddJob} />
        </CalcSection>

        <CalcSection n={4} title="Packing" subtitle="Biaya kemasan & pelindung produk" icon="📦"
          subtotal={paidCore ? (r?.packing ?? 0) : undefined}
          summary={packing ? `${packing.nama} · ${rupiah(packing.harga)}` : "Tanpa packing"}>
          <PackingInput locked={!paidCore} presets={settings.packingPresets} packing={packing} onChange={setPacking} />
        </CalcSection>
      </div>

      {/* Kolom kanan: hasil (sticky desktop) */}
      <div className="hidden lg:block lg:sticky lg:top-6 min-w-0">
        {view ? (
          <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian} />
        ) : (
          <div className="text-[12px] g-t4 p-4">Isi berat &amp; durasi (angka &gt; 0) untuk melihat hasil.</div>
        )}
      </div>

      {view && (
        <>
          <MobileSummaryBar modal={view.rincian.biayaModal} harga={view.strategi[channel]?.[tier]?.harga ?? 0} onOpen={() => setSheetOpen(true)} />
          {sheetOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
              <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={() => setSheetOpen(false)} />
              <div className="relative max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 modal-surface">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold g-t1">Hasil perhitungan</span>
                  <button type="button" aria-label="Tutup rincian" className="g-t3 text-lg leading-none" onClick={() => setSheetOpen(false)}>✕</button>
                </div>
                <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
