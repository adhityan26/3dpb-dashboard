/** Allowlist owner untuk /admin — dari env OWNER_EMAILS (comma-separated). */
export function isOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.OWNER_EMAILS ?? "";
  const list = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
