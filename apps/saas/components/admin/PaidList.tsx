"use client";
import { useState } from "react";

export type PaidRow = { id: string; userId: string; amount: number; who: string; when: string };

export function PaidList({ rows }: { rows: PaidRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function deactivate(userId: string) {
    if (!confirm("Nonaktifkan akses user ini (refund)?")) return;
    setBusy(userId);
    await fetch("/api/admin/payment/deactivate", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
    });
    setBusy(null);
    window.location.reload();
  }
  if (rows.length === 0) return <p className="text-[12px] g-t4">Belum ada pembayaran terverifikasi.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead><tr className="g-t4 text-left"><th className="pr-3">Nominal</th><th className="pr-3">User</th><th className="pr-3">Tgl</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="pr-3">{"Rp" + r.amount.toLocaleString("id-ID")}</td>
              <td className="pr-3">{r.who}</td>
              <td className="pr-3">{r.when}</td>
              <td><button onClick={() => deactivate(r.userId)} disabled={busy === r.userId} className="text-[11px] underline" style={{ color: "#dc2626" }}>Nonaktifkan</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
