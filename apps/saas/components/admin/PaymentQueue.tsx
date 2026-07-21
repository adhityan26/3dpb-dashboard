"use client";
import { useState } from "react";
import { GlassButton } from "@3pb/ui";

export type PendingRow = { id: string; amount: number; who: string; ageMin: number; marked: boolean; hasProof: boolean };

export function PaymentQueue({ rows }: { rows: PendingRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function act(id: string, action: "activate" | "cancel") {
    setBusy(id);
    await fetch(`/api/admin/payment/${id}/${action}`, { method: "PUT" });
    setBusy(null);
    window.location.reload();
  }
  if (rows.length === 0) return <p className="text-[12px] g-t4">Tidak ada pembayaran pending.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px]" style={{ color: "#dc2626" }}>
        ⚠️ "Diklaim" cuma tanda user meng-klik sudah bayar — <b>bukan bukti</b>. Cek mutasi bank untuk nominal <b>PERSIS</b> sebelum Aktifkan.
      </p>
      <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead><tr className="g-t4 text-left"><th className="pr-3">Nominal</th><th className="pr-3">User</th><th className="pr-3">Umur</th><th className="pr-3">Bukti</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="pr-3 font-medium">{"Rp" + r.amount.toLocaleString("id-ID")} {r.marked && <span className="text-[10px]" style={{ color: "#d97706" }} title="user meng-klik sudah bayar — belum diverifikasi">diklaim</span>}</td>
              <td className="pr-3">{r.who}</td>
              <td className="pr-3">{r.ageMin}m</td>
              <td className="pr-3 py-1">
                {r.hasProof ? (
                  <a href={`/api/beli/${r.id}/proof`} target="_blank" rel="noreferrer">
                    <img src={`/api/beli/${r.id}/proof`} alt={`Bukti ${r.who}`} className="h-12 w-12 object-cover rounded-[6px]" />
                  </a>
                ) : (
                  <span className="g-t5">—</span>
                )}
              </td>
              <td className="flex gap-2 py-1">
                <GlassButton onClick={() => act(r.id, "activate")} disabled={busy === r.id} className="h-7 px-2 text-[11px]">Aktifkan</GlassButton>
                <button onClick={() => act(r.id, "cancel")} disabled={busy === r.id} className="text-[11px] g-t4 underline">Batalkan</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
