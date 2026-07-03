import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/invoice/service", () => ({
  createQuotation: vi.fn(),
  getQuotationByNomor: vi.fn(),
}))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { POST } from "@/app/api/bot/invoice/route"
import { GET } from "@/app/api/bot/invoice/[nomor]/route"
import { createQuotation, getQuotationByNomor } from "@/lib/invoice/service"
import { requireBotToken } from "@/lib/bot/auth"

const mockCreate = createQuotation as any
const mockByNomor = getQuotationByNomor as any
const mockAuth = requireBotToken as any

function req(body?: unknown) {
  return { headers: { get: () => "Bearer x" }, json: async () => body } as any
}

describe("POST /api/bot/invoice", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await POST(req({ buyer: "B", items: [{ namaProduk: "A", qty: 1, hargaPerUnit: 100 }] }))
    expect(res.status).toBe(401)
  })

  it("400 when items empty", async () => {
    mockAuth.mockReturnValue(true)
    const res = await POST(req({ buyer: "B", items: [] }))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("400 when an item has non-positive qty", async () => {
    mockAuth.mockReturnValue(true)
    const res = await POST(req({ buyer: "B", items: [{ namaProduk: "A", qty: 0, hargaPerUnit: 100 }] }))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("creates and returns nomor/total/url", async () => {
    mockAuth.mockReturnValue(true)
    mockCreate.mockResolvedValue({ nomor: "INV-1", total: 200 })
    const res = await POST(req({ buyer: "B", items: [{ namaProduk: "A", qty: 2, hargaPerUnit: 100 }], ongkir: 5000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nomor).toBe("INV-1")
    expect(body.total).toBe(200)
    expect(body.url).toContain("/tagihan")
    const arg = mockCreate.mock.calls[0][0]
    expect(arg.buyerNama).toBe("B")
    expect(arg.ongkir).toBe(5000)
    expect(arg.items[0].channelHarga).toBe("marketplace")
  })
})

describe("GET /api/bot/invoice/[nomor]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await GET(req(), { params: Promise.resolve({ nomor: "INV-1" }) })
    expect(res.status).toBe(401)
  })

  it("404 when not found", async () => {
    mockAuth.mockReturnValue(true)
    mockByNomor.mockResolvedValue(null)
    const res = await GET(req(), { params: Promise.resolve({ nomor: "INV-X" }) })
    expect(res.status).toBe(404)
  })

  it("returns status/total/paid/sisa", async () => {
    mockAuth.mockReturnValue(true)
    mockByNomor.mockResolvedValue({ nomor: "INV-1", status: "PARTIAL", total: 200, totalPaid: 50, sisaBayar: 150 })
    const res = await GET(req(), { params: Promise.resolve({ nomor: "INV-1" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ nomor: "INV-1", status: "PARTIAL", total: 200, totalPaid: 50, sisaBayar: 150 })
  })
})
