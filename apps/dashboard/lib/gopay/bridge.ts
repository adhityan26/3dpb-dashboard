const ALLOWED_ROLES = ["OWNER"]

export function assertGopayRole(role: string | undefined) {
  return !!role && ALLOWED_ROLES.includes(role)
}

function bridgeUrl(path: string) {
  const base = process.env.GOPAY_LOGIN_BRIDGE_URL
  if (!base) throw new Error("GOPAY_LOGIN_BRIDGE_URL belum diset")
  return `${base.replace(/\/$/, "")}${path}`
}

function bridgeHeaders() {
  const apiKey = process.env.GOPAY_LOGIN_BRIDGE_API_KEY
  if (!apiKey) throw new Error("GOPAY_LOGIN_BRIDGE_API_KEY belum diset")
  return { "x-api-key": apiKey, "Content-Type": "application/json" }
}

export async function bridgeStart() {
  const res = await fetch(bridgeUrl("/start"), { method: "POST", headers: bridgeHeaders() })
  return res.json()
}

export async function bridgeOutput() {
  const res = await fetch(bridgeUrl("/output"), { headers: bridgeHeaders(), cache: "no-store" })
  return res.json()
}

export async function bridgeInput(value: string) {
  const res = await fetch(bridgeUrl("/input"), {
    method: "POST",
    headers: bridgeHeaders(),
    body: JSON.stringify({ value }),
  })
  return res.json()
}

export async function bridgeCancel() {
  const res = await fetch(bridgeUrl("/cancel"), { method: "POST", headers: bridgeHeaders() })
  return res.json()
}

export interface GopayTokenStatus {
  connected: boolean
  message?: string
}

export async function gopayTokenStatus(): Promise<GopayTokenStatus> {
  const base = process.env.GOPAY_GATEWAY_URL
  const apiKey = process.env.GOPAY_LOGIN_BRIDGE_API_KEY
  if (!base || !apiKey) return { connected: false, message: "GoPay gateway belum dikonfigurasi" }

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/token-status`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    })
    const data = await res.json()
    const tokenStatus = data?.data?.token_status
    return {
      connected: tokenStatus === "valid",
      message: data?.data?.message,
    }
  } catch (err) {
    return { connected: false, message: err instanceof Error ? err.message : "Gagal menghubungi GoPay gateway" }
  }
}
