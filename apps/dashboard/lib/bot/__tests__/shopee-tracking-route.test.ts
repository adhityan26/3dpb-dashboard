import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/tracking", () => ({ getTrackingNumber: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { GET } from "@/app/api/bot/shopee/order/[sn]/tracking/route"
import { getTrackingNumber } from "@/lib/shopee/tracking"
import { requireBotToken } from "@/lib/bot/auth"

const mockTracking = getTrackingNumber as any
const mockAuth = requireBotToken as any
const req = { headers: { get: () => "Bearer x" } } as any
const ctx = (sn: string) => ({ params: Promise.resolve({ sn }) })

describe("GET /api/bot/shopee/order/[sn]/tracking", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(401)
  })

  it("returns the tracking number when available", async () => {
    mockAuth.mockReturnValue(true)
    mockTracking.mockResolvedValue("SPXTRK123")
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ trackingNumber: "SPXTRK123" })
  })

  it("returns null trackingNumber (not an error) when not yet available", async () => {
    mockAuth.mockReturnValue(true)
    mockTracking.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ trackingNumber: null })
  })
})
