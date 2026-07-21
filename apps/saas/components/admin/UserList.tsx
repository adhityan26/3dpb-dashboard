"use client";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

export type UserPayment = { id: string; amount: number; when: string; hasProof: boolean };
export type UserRow = { who: string; status: string; joined: string; payment?: UserPayment };

export function UserList({ rows }: { rows: UserRow[] }) {
  if (rows.length === 0) return <p className="text-[12px] g-t4">Belum ada user.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead>
          <tr className="g-t4 text-left">
            <th className="pr-4">User</th>
            <th className="pr-4">Status</th>
            <th className="pr-4">Daftar</th>
            <th>Pembayaran</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-4">{r.who}</td>
              <td className="pr-4">{r.status}</td>
              <td className="pr-4">{r.joined}</td>
              <td>
                {r.payment ? (
                  <span className="inline-flex items-center gap-2 flex-wrap">
                    <span>{rupiah(r.payment.amount)} · {r.payment.when}</span>
                    {r.payment.hasProof && (
                      <a href={`/api/beli/${r.payment.id}/proof`} target="_blank" rel="noreferrer" className="underline g-t4">
                        bukti
                      </a>
                    )}
                    <a href="#pembayaran" className="underline g-t4">detail →</a>
                  </span>
                ) : (
                  <span className="g-t5">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
