"use client";

export type UserRow = { who: string; status: string; joined: string };

export function UserList({ rows }: { rows: UserRow[] }) {
  if (rows.length === 0) return <p className="text-[12px] g-t4">Belum ada user.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead>
          <tr className="g-t4 text-left">
            <th className="pr-4">User</th>
            <th className="pr-4">Status</th>
            <th>Daftar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-4">{r.who}</td>
              <td className="pr-4">{r.status}</td>
              <td>{r.joined}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
