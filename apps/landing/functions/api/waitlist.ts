import { validateWaitlist } from "../_lib/validate";
interface Env { DB: D1Database }
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: unknown;
  try { body = await ctx.request.json(); } catch { return json({ error: "format tidak valid" }, 400); }
  const v = validateWaitlist(body);
  if (!v.ok) return json({ error: v.error }, 400);
  try {
    await ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO waitlist (id, email, interest, created_at) VALUES (?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), v.email, v.interest, new Date().toISOString()).run();
  } catch { return json({ error: "gagal menyimpan, coba lagi" }, 500); }
  return json({ ok: true });
};
