import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/kalkulator/rates", () => ({ loadRates: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { POST } from "@/app/api/bot/kalkulator/route"
import { loadRates } from "@/lib/kalkulator/rates"
import { requireBotToken } from "@/lib/bot/auth"

const mockRates = loadRates as any
const mockAuth = requireBotToken as any
const req = (body: unknown) => ({ headers: { get: () => "Bearer x" }, json: async () => body } as any)

const RATES = {
  fdmHppPerGram: 300, slaHppPerGram: 800, fdmJualPerGram: 500, slaJualPerGram: 1200,
  mesinPerJam: 1000, adminEcommerce: 0.8, failureRatePct: 12, failureSpreadPct: 50,
  testLayerPct: 5, packing: {}, gantungan: {}, switchPerPcs: 0, labelPerLembar: 0,
}

describe("POST /api/bot/kalkulator", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await POST(req({ gramasi: 50, jam: 2 }))
    expect(res.status).toBe(401)
  })

  it("400 when gramasi or jam <= 0", async () => {
    mockAuth.mockReturnValue(true)
    const res = await POST(req({ gramasi: 0, jam: 2 }))
    expect(res.status).toBe(400)
  })

  it("returns computed prices", async () => {
    mockAuth.mockReturnValue(true)
    mockRates.mockResolvedValue(RATES)
    const res = await POST(req({ gramasi: 50, jam: 2, tipe: "FDM", tier: "A" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("hppTotal")
    expect(body).toHaveProperty("floorPrice")
    expect(body).toHaveProperty("shopeeA")
    expect(body).toHaveProperty("offlineA")
    expect(body).toHaveProperty("marginShopeeA")
    expect(typeof body.hppTotal).toBe("number")
  })
})
