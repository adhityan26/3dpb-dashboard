const D1_DATABASE_ID = "fc76ff99-d167-4570-a8ae-58923ab31e4d"; // slizebiz-waitlist (landing)

export interface WaitlistRow {
  id: string;
  email: string;
  interest: string;
  created_at: string;
}

/** Baca waitlist read-only dari Cloudflare D1 milik landing (spec amandemen #2). */
export async function fetchWaitlist(): Promise<WaitlistRow[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID tidak diset");
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN tidak diset");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: "SELECT id, email, interest, created_at FROM waitlist ORDER BY created_at DESC",
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare D1 query gagal: HTTP ${res.status}`);
  const data = (await res.json()) as { success?: boolean; result?: { results?: WaitlistRow[] }[] };
  if (!data.success) throw new Error("Cloudflare D1 query tidak sukses");
  return data.result?.[0]?.results ?? [];
}

function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCSV(rows: WaitlistRow[]): string {
  const header = "id,email,interest,created_at";
  const lines = rows.map((r) => [r.id, r.email, r.interest, r.created_at].map(csvField).join(","));
  return [header, ...lines].join("\n");
}
