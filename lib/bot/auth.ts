/** Constant-time string comparison to avoid timing leaks on the token. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verify the bearer token on a bot API request.
 * Returns true only when Authorization: "Bearer <token>" matches BOT_API_TOKEN
 * and the env var is set. Unset env → always false (never open access).
 */
export function requireBotToken(req: { headers: { get(name: string): string | null } }): boolean {
  const expected = process.env.BOT_API_TOKEN
  if (!expected) return false
  const header = req.headers.get("authorization")
  if (!header || !header.startsWith("Bearer ")) return false
  const token = header.slice("Bearer ".length)
  return timingSafeEqual(token, expected)
}
