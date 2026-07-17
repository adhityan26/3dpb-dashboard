export function validateWaitlist(body: unknown):
  { ok: true; email: string; interest: string } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const interest = b.interest;
  if (email.length > 254) return { ok: false, error: "email tidak valid" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "email tidak valid" };
  if (interest !== "beli" && interest !== "subscribe") return { ok: false, error: "minat tidak valid" };
  return { ok: true, email, interest };
}
