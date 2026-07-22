"use client";
import { useEffect, useState } from "react";
import type { MarginTier } from "@3pb/kalkulator-core";
import { fullView, type CalcPlate } from "@/lib/kalkulator/compute";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings } from "@/lib/store/local-settings";
import { rupiah } from "@/lib/kalkulator/format";
import { CalcSection } from "./CalcSection";
import { PlateInput, type PlateRow } from "./PlateInput";
import { KomponenInput } from "./KomponenInput";
import { LaborInput } from "./LaborInput";
import { PackingInput } from "./PackingInput";
import { ResultPanel } from "./ResultPanel";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";

const INITIAL_PLATES: PlateRow[] = [{ id: "plate-1", nama: "", tipe: "FDM", gramasi: "50", durasiJam: "3" }];

export function Calculator({ authenticated, paidCore = false, userId = null }: { authenticated: boolean; paidCore?: boolean; userId?: string | null }) {
  const [plates, setPlates] = useState<PlateRow[]>(INITIAL_PLATES);
  const [batch, setBatch] = useState("1");
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [komponen, setKomponen] = useState<KomponenRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [packing, setPacking] = useState<{ nama: string; harga: number } | undefined>(undefined);
  const [channel, setChannel] = useState("offline");
  const [tier, setTier] = useState<MarginTier>("B");

  useEffect(() => {
    if (paidCore && userId) loadSettings(userId).then(setSettings);
  }, [paidCore, userId]);

  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, tipe: p.tipe,
    gramasi: Number(p.gramasi), durasiJam: Number(p.durasiJam),
  });
  const valid = plates.length > 0 && plates.every((p) => Number(p.gramasi) > 0 && Number(p.durasiJam) > 0);
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

  const r = view?.rincian;
  const hasil = Math.max(1, Number(batch) || 1);

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(320px,380px)] gap-5 items-start pb-24 lg:pb-0">
      {/* Kolom kiri: form section */}
      <div className="flex flex-col gap-4 min-w-0">
        <CalcSection n={1} title="Produksi (Cetak 3D)" subtitle="Biaya material dan waktu cetak"
          subtotalLabel="Subtotal per produk" subtotal={r?.produksi}>
          <PlateInput locked={!paidCore} plates={plates} batch={batch} onPlatesChange={setPlates} onBatchChange={setBatch} />
          {view && (
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[12px]">
              <span className="g-t4">Biaya per proses <span className="g-t1 font-medium">{rupiah(r!.produksi * hasil)}</span></span>
              <span className="g-t4">Hasil per proses <span className="g-t1 font-medium">{hasil} pcs</span></span>
              <span className="g-t4">Biaya per produk <span className="g-t1 font-medium">{rupiah(r!.produksi)}</span></span>
            </div>
          )}
        </CalcSection>

        <CalcSection n={2} title="Komponen tambahan" subtitle="Komponen yang dipasang pada produk"
          subtotal={paidCore ? (r?.komponen ?? 0) : undefined}
          summary={komponen.length ? `${komponen.length} item · ${rupiah(r?.komponen ?? 0)}` : "Belum ada"}>
          <KomponenInput locked={!paidCore} presets={settings.komponenPresets} komponen={komponen} onChange={setKomponen} />
        </CalcSection>

        <CalcSection n={3} title="Finishing & tenaga kerja" subtitle="Perakitan, pengamplasan, pengecatan, dll."
          subtotal={paidCore ? (r?.labor ?? 0) : undefined}
          summary={labor.length ? `${labor.length} pekerjaan · ${rupiah(r?.labor ?? 0)}` : "Belum ada"}>
          <LaborInput locked={!paidCore} presets={settings.laborPresets} labor={labor} onChange={setLabor} />
        </CalcSection>

        <CalcSection n={4} title="Packing" subtitle="Biaya kemasan & pelindung produk"
          subtotal={paidCore ? (r?.packing ?? 0) : undefined}
          summary={packing ? `${packing.nama} · ${rupiah(packing.harga)}` : "Tanpa packing"}>
          <PackingInput locked={!paidCore} presets={settings.packingPresets} packing={packing} onChange={setPacking} />
        </CalcSection>
      </div>

      {/* Kolom kanan: hasil (sticky desktop) */}
      <div className="lg:sticky lg:top-6 min-w-0">
        {view ? (
          <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} />
        ) : (
          <div className="text-[12px] g-t4 p-4">Isi berat &amp; durasi (angka &gt; 0) untuk melihat hasil.</div>
        )}
      </div>
    </div>
  );
}
