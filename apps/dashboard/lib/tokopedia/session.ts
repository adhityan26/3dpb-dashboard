import { prisma } from "@/lib/db"
import { TokopediaError, type SessionMeta, type StoredSession } from "./types"

const CONFIG_KEY = "tokopedia.session"

export function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
    return typeof payload.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

export async function saveSession(cookies: { name: string; value: string }[]): Promise<SessionMeta> {
  const flat: Record<string, string> = {}
  for (const c of cookies) if (c?.name) flat[c.name] = c.value

  const sellerToken = flat["SELLER_TOKEN"]
  const sellerId = flat["oec_seller_id_unified_seller_env"]
  const appId = flat["app_id_unified_seller_env"] ?? "4068"
  if (!sellerToken) throw new TokopediaError("UNKNOWN", "SELLER_TOKEN cookie tidak ditemukan")
  if (!sellerId) throw new TokopediaError("UNKNOWN", "Cookie seller id (oec_seller_id_unified_seller_env) tidak ditemukan")

  const exp = decodeJwtExp(sellerToken)
  const tokenExpiry = exp != null ? new Date(exp * 1000).toISOString() : null
  const updatedAt = new Date().toISOString()

  // 2026-10-05: the session-refresher kept re-saving the SAME already-expired
  // SELLER_TOKEN harvested from its stale browser profile (reporting "success"),
  // overwriting the fresh cookies pasted by hand and leaving the API on a dead
  // token for a day. Refuse an expired token, and never let an older token clobber
  // a newer stored one — the caller (Settings card / refresher) gets a clear error.
  if (tokenExpiry && exp! * 1000 <= Date.now()) {
    throw new TokopediaError("SESSION_EXPIRED", `SELLER_TOKEN yang dikirim sudah expired (${tokenExpiry}) — login ulang di seller-id.tokopedia.com dulu, lalu ekspor cookie yang baru`)
  }
  const existing = await getRawSession()
  if (tokenExpiry && existing?.tokenExpiry && new Date(tokenExpiry).getTime() < new Date(existing.tokenExpiry).getTime()) {
    throw new TokopediaError("SESSION_EXPIRED", `SELLER_TOKEN yang dikirim (${tokenExpiry}) lebih lama daripada yang sudah tersimpan (${existing.tokenExpiry}) — tidak ditimpa`)
  }

  const stored: StoredSession = { cookies: flat, sellerId, appId, userAgent: flat["_user_agent"] ?? null, updatedAt, tokenExpiry }
  const value = JSON.stringify(stored)
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value },
    create: { key: CONFIG_KEY, value },
  })
  return { sellerId, appId, updatedAt, tokenExpiry }
}

export async function getRawSession(): Promise<StoredSession | null> {
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as StoredSession
  } catch {
    return null
  }
}

export async function getSessionStatus(): Promise<{
  exists: boolean; sellerId?: string; updatedAt?: string; tokenExpiry?: string | null; expired?: boolean
}> {
  const s = await getRawSession()
  if (!s) return { exists: false }
  const expired = s.tokenExpiry != null && new Date(s.tokenExpiry).getTime() < Date.now()
  return { exists: true, sellerId: s.sellerId, updatedAt: s.updatedAt, tokenExpiry: s.tokenExpiry, expired }
}
