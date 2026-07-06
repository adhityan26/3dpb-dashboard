import { getRawSession } from "./session"
import { TokopediaError } from "./types"

const BASE = "https://seller-id.tokopedia.com/api/fulfillment/order/list"
const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"

export async function tokopediaRequest<T = unknown>(body: object): Promise<T> {
  const session = await getRawSession()
  if (!session) throw new TokopediaError("SESSION_MISSING")

  const cookieString = Object.entries(session.cookies)
    .filter(([name]) => name !== "_user_agent")
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")

  const url = `${BASE}?aid=${session.appId}&locale=id-ID&oec_seller_id=${session.sellerId}&seller_id=${session.sellerId}`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9,id;q=0.8",
      "content-type": "application/json",
      origin: "https://seller-id.tokopedia.com",
      referer: "https://seller-id.tokopedia.com/order",
      "user-agent": session.userAgent ?? DEFAULT_UA,
      cookie: cookieString,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new TokopediaError("UNKNOWN", `HTTP ${res.status}`)
  const json = await res.json() as { code: number; message?: string; data?: T }
  if (json.code === 10000) throw new TokopediaError("SESSION_INVALID", json.message ?? "session invalid / IP mismatch")
  if (json.code !== 0) throw new TokopediaError("UNKNOWN", json.message ?? `Tokopedia code ${json.code}`)
  return json.data as T
}
