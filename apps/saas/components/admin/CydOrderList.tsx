"use client";
import { useState } from "react";

export type CydOrderRow = {
  id: string; who: string; quantity: number;
  shippingAddress: string | null; shippingCost: number | null; shippingStatus: string | null;
};

const STATUSES = ["PACKED", "SHIPPED", "DELIVERED"] as const;

export function CydOrderList({ rows }: { rows: CydOrderRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/admin/cyd-orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(null);
    window.location.reload();
  }

  if (rows.length === 0) return <p className="text-[12px] g-t4">Belum ada pesanan CYD.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead><tr className="g-t4 text-left"><th className="pr-3">User</th><th className="pr-3">Qty</th><th className="pr-3">Alamat</th><th className="pr-3">Ongkir</th><th>Status kirim</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="pr-3">{r.who}</td>
              <td className="pr-3">{r.quantity}</td>
              <td className="pr-3">{r.shippingAddress}</td>
              <td className="pr-3">
                <input type="number" defaultValue={r.shippingCost ?? undefined} disabled={busy === r.id}
                  aria-label="Ongkir"
                  onBlur={(e) => { const v = Number(e.target.value); if (v && v !== r.shippingCost) patch(r.id, { shippingCost: v }); }}
                  className="w-20 border rounded-[6px] px-1" />
              </td>
              <td>
                <select aria-label="Status kirim" defaultValue={r.shippingStatus ?? ""} disabled={busy === r.id}
                  onChange={(e) => patch(r.id, { shippingStatus: e.target.value })}
                  className="border rounded-[6px] px-1 py-0.5">
                  <option value="" disabled>—</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
