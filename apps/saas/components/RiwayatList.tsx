"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard, GlassButton } from "@3pb/ui";
import { listKalkulasi, deleteKalkulasi, putKalkulasi, type KalkulasiRecord } from "@/lib/store/kalkulasi-history";
import { computeKalkulasiSnapshot } from "@/lib/kalkulator/snapshot";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings } from "@/lib/store/local-settings";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";

export function RiwayatList({ userId }: { userId: string }) {
  const [records, setRecords] = useState<KalkulasiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listKalkulasi(userId).then((r) => { setRecords(r); setLoading(false); });
  };

  // Standard fetch-on-mount/on-userId-change pattern; `load` closes only over `userId`
  // (already in the dep array) and setLoading(true) at its start is the loading-flag
  // half of the fetch, not a derived-render-value anti-pattern. Adding `load` itself to
  // deps would refetch on every render (it's redefined each render, not memoized).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [userId]);
  useEffect(() => { loadSettings(userId).then((s) => { setSettings(s); setSettingsReady(true); }); }, [userId]);

  const onDelete = (id: string) => {
    if (!window.confirm("Hapus kalkulasi ini? Tindakan ini tak bisa dibatalkan.")) return;
    deleteKalkulasi(userId, id).then(load);
  };

  const onDuplicate = (record: KalkulasiRecord) => {
    const snapshot = computeKalkulasiSnapshot(record.input, settings);
    if (!snapshot) { setActionMsg("Gagal duplikat — data plate tidak valid"); return; }
    const now = new Date().toISOString();
    const copy: KalkulasiRecord = { ...record, id: newId(), nama: record.nama + " (salinan)", createdAt: now, updatedAt: now, snapshot };
    putKalkulasi(copy).then(() => { setActionMsg(null); load(); }).catch(() => setActionMsg("Gagal duplikat — coba lagi"));
  };

  const onRecalculate = (record: KalkulasiRecord) => {
    const newSnapshot = computeKalkulasiSnapshot(record.input, settings);
    if (!newSnapshot) { setActionMsg("Gagal hitung ulang — data plate tidak valid"); return; }
    if (newSnapshot.rekomendasi === record.snapshot.rekomendasi) {
      setActionMsg("Tidak ada perubahan — harga masih sama");
      return;
    }
    const delta = newSnapshot.rekomendasi - record.snapshot.rekomendasi;
    const sign = delta >= 0 ? "+" : "-";
    const pesan = `Perbarui harga "${record.nama}"?\n${rupiah(record.snapshot.rekomendasi)} → ${rupiah(newSnapshot.rekomendasi)} (${sign}${rupiah(Math.abs(delta))})`;
    if (!window.confirm(pesan)) return;
    putKalkulasi({ ...record, updatedAt: new Date().toISOString(), snapshot: newSnapshot })
      .then(() => { setActionMsg(null); load(); })
      .catch(() => setActionMsg("Gagal hitung ulang — coba lagi"));
  };

  if (loading || !settingsReady) {
    return <div className="text-[12px] g-t4 p-4">Memuat riwayat…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link href="/kalkulator"><GlassButton>Hitung</GlassButton></Link>
        <button type="button" onClick={load} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[12px]">🔄 Refresh</button>
      </div>

      {actionMsg && <div className="text-[12px] g-t4">{actionMsg}</div>}

      {records.length === 0 ? (
        <GlassCard className="p-6 text-center">
          <p className="text-[13px] g-t3">Belum ada riwayat, mulai hitung pertama kamu.</p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((rec) => (
            <GlassCard key={rec.id} className="p-3 flex items-center justify-between gap-3">
              <Link href={`/kalkulator/${rec.id}`} className="flex-1 min-w-0 no-underline">
                <div className="text-[13px] font-medium g-t1 truncate">{rec.nama}</div>
                <div className="text-[11px] g-t4">{new Date(rec.updatedAt).toLocaleDateString("id-ID")} · {rupiah(rec.snapshot.rekomendasi)}</div>
              </Link>
              <button type="button" aria-label="Duplikat" onClick={() => onDuplicate(rec)} className="g-btn-ghost h-8 px-2 rounded-[5px] text-[13px] shrink-0">📋</button>
              <button type="button" aria-label="Hitung ulang" onClick={() => onRecalculate(rec)} className="g-btn-ghost h-8 px-2 rounded-[5px] text-[13px] shrink-0">🧮</button>
              <button type="button" aria-label="Hapus" onClick={() => onDelete(rec.id)} className="g-btn-ghost h-8 px-2 rounded-[5px] text-[13px] shrink-0">🗑️</button>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
