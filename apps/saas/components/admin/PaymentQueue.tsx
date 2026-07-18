"use client";
import { useState } from "react";
import { GlassButton } from "@3pb/ui";

export type PendingRow = { id: string; amount: number; who: string; ageMin: number; marked: boolean };

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
    <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead><tr className="g-t4 text-left"><th className="pr-3">Nominal</th><th className="pr-3">User</th><th className="pr-3">Umur</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="pr-3 font-medium">{"Rp" + r.amount.toLocaleString("id-ID")} {r.marked && <span title="user tandai sudah bayar">✅</span>}</td>
              <td className="pr-3">{r.who}</td>
              <td className="pr-3">{r.ageMin}m</td>
              <td className="flex gap-2 py-1">
                <GlassButton onClick={() => act(r.id, "activate")} disabled={busy === r.id} className="h-7 px-2 text-[11px]">Aktifkan</GlassButton>
                <button onClick={() => act(r.id, "cancel")} disabled={busy === r.id} className="text-[11px] g-t4 underline">Batalkan</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
