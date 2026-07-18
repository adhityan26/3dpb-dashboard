"use client";
import { toCSV, type WaitlistRow } from "@/lib/waitlist/cloudflare";

export function WaitlistTable({ rows }: { rows: WaitlistRow[] }) {
  function exportCsv() {
    const blob = new Blob([toCSV(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "waitlist.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  if (rows.length === 0) return <p className="text-[12px] g-t4">Belum ada waitlist.</p>;
  return (
    <div className="flex flex-col gap-2">
      <button className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px] self-start" onClick={exportCsv}>Ekspor CSV</button>
      <div className="overflow-x-auto">
        <table className="text-[12px] g-t2 w-full">
          <thead><tr className="g-t4 text-left"><th className="pr-4">Email</th><th className="pr-4">Minat</th><th>Tanggal</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td className="pr-4">{r.email}</td><td className="pr-4">{r.interest}</td><td>{r.created_at}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
