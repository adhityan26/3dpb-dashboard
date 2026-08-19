"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MarginTier } from "@3pb/kalkulator-core";
import { GlassInput } from "@3pb/ui";
import { fullView, type CalcPlate } from "@/lib/kalkulator/compute";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings } from "@/lib/store/local-settings";
import { getKalkulasi, putKalkulasi, type KalkulasiRecord } from "@/lib/store/kalkulasi-history";
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

export function Calculator({ paidCore = false, userId = null, kalkulasiId }: { paidCore?: boolean; userId?: string | null; kalkulasiId?: string }) {
  const router = useRouter();
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
  const [nama, setNama] = useState("");
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [createdAt, setCreatedAt] = useState<string | undefined>(undefined);
  const [loadingRecord, setLoadingRecord] = useState(!!kalkulasiId);
  const [notFound, setNotFound] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (paidCore && userId) loadSettings(userId).then(setSettings);
  }, [paidCore, userId]);

  // Reads a localStorage preference, unavailable during SSR; must run once after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setShowRincian(getRincianPref()); }, []);

  useEffect(() => {
    if (!kalkulasiId || !userId) return;
    let cancelled = false;
    getKalkulasi(userId, kalkulasiId).then((record) => {
      if (cancelled) return;
      if (!record) { setNotFound(true); setLoadingRecord(false); return; }
      setPlates(record.input.plates);
      setBatch(record.input.batch);
      setKomponen(record.input.komponen);
      setLabor(record.input.labor);
      setPacking(record.input.packing);
      setChannel(record.input.channel);
      setTier(record.input.tier);
      setNama(record.nama);
      setSavedId(record.id);
      setCreatedAt(record.createdAt);
      setLoadingRecord(false);
    });
    return () => { cancelled = true; };
  }, [kalkulasiId, userId]);

  const refreshTarif = () => {
    if (paidCore && userId) loadSettings(userId).then(setSettings);
  };

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
  const handleSave = () => {
    if (saving) return;
    if (!userId || !view) { if (!view) setSaveMsg("Isi berat & durasi dulu"); return; }
    const id = savedId ?? newId();
    const finalNama = nama.trim() || "Kalkulasi " + new Date().toLocaleDateString("id-ID");
    const finalCreatedAt = createdAt ?? new Date().toISOString();
    const record: KalkulasiRecord = {
      id,
      userId,
      nama: finalNama,
      createdAt: finalCreatedAt,
      updatedAt: new Date().toISOString(),
      input: { plates, batch, komponen, labor, packing, channel, tier },
      snapshot: {
        biayaModal: view.biayaModal,
        hargaJualMinimum: view.hargaJualMinimum,
        rekomendasi: view.rekomendasi,
        status: view.status,
        strategi: view.strategi,
      },
    };
    const isFirstSave = savedId === undefined;
    setSaving(true);
    putKalkulasi(record).then(() => {
      setSavedId(id);
      setCreatedAt(finalCreatedAt);
      setNama(finalNama);
      setSaveMsg(null);
      setSaving(false);
      if (isFirstSave) router.push(`/kalkulator/${id}`);
    }).catch(() => {
      setSaving(false);
      setSaveMsg("Gagal menyimpan — coba lagi");
    });
  };

  const handleDuplicate = () => {
    if (saving) return;
    if (!userId || !view || savedId === undefined) return;
    const id = newId();
    const now = new Date().toISOString();
    const finalNama = (nama.trim() || "Kalkulasi " + new Date().toLocaleDateString("id-ID")) + " (salinan)";
    const record: KalkulasiRecord = {
      id,
      userId,
      nama: finalNama,
      createdAt: now,
      updatedAt: now,
      input: { plates, batch, komponen, labor, packing, channel, tier },
      snapshot: {
        biayaModal: view.biayaModal,
        hargaJualMinimum: view.hargaJualMinimum,
        rekomendasi: view.rekomendasi,
        status: view.status,
        strategi: view.strategi,
      },
    };
    setSaving(true);
    putKalkulasi(record).then(() => {
      setSaving(false);
      router.push(`/kalkulator/${id}`);
    }).catch(() => {
      setSaving(false);
      setSaveMsg("Gagal duplikat — coba lagi");
    });
  };

  const r = view?.rincian;
  const hasil = Math.max(1, Number(batch) || 1);

  if (loadingRecord) {
    return <div className="text-[12px] g-t4 p-4">Memuat kalkulasi…</div>;
  }
  if (notFound) {
    return (
      <div className="text-[12px] g-t4 p-4">
        Kalkulasi tidak ditemukan. <Link href="/" className="underline">Kembali ke Riwayat</Link>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(350px,410px)] gap-5 items-start pb-24 lg:pb-0">
      {/* Kolom kiri: form section */}
      <div className="flex flex-col gap-4 min-w-0">
        {paidCore && (
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/" className="text-[12px] g-t3 underline shrink-0">← Riwayat</Link>
            <GlassInput
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama kalkulasi (opsional)"
              className="flex-1 min-w-[160px]"
            />
            <button type="button" onClick={refreshTarif} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[12px] shrink-0">
              🔄 Refresh tarif
            </button>
          </div>
        )}
        {saveMsg && <div className="text-[12px] g-t4">{saveMsg}</div>}

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
          <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian}
            onSave={paidCore ? handleSave : undefined} isEditing={savedId !== undefined}
            onDuplicate={paidCore && savedId !== undefined ? handleDuplicate : undefined} />
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
                <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian}
                  onSave={paidCore ? handleSave : undefined} isEditing={savedId !== undefined}
                  onDuplicate={paidCore && savedId !== undefined ? handleDuplicate : undefined} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
