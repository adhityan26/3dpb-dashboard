"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard, GlassButton } from "@3pb/ui";
import { listKalkulasi, deleteKalkulasi, type KalkulasiRecord } from "@/lib/store/kalkulasi-history";
import { rupiah } from "@/lib/kalkulator/format";

export function RiwayatList({ userId }: { userId: string }) {
  const [records, setRecords] = useState<KalkulasiRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listKalkulasi(userId).then((r) => { setRecords(r); setLoading(false); });
  };

  useEffect(() => { load(); }, [userId]);

  const onDelete = (id: string) => {
    if (!window.confirm("Hapus kalkulasi ini? Tindakan ini tak bisa dibatalkan.")) return;
    deleteKalkulasi(userId, id).then(load);
  };

  if (loading) {
    return <div className="text-[12px] g-t4 p-4">Memuat riwayat…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link href="/kalkulator"><GlassButton>Hitung</GlassButton></Link>
        <button type="button" onClick={load} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[12px]">🔄 Refresh</button>
      </div>

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
              <button type="button" aria-label="Hapus" onClick={() => onDelete(rec.id)} className="g-btn-ghost h-8 px-2 rounded-[5px] text-[13px] shrink-0">🗑️</button>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
