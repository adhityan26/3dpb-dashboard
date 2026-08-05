import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/shopee/logistics", () => ({ generateShippingDocument: vi.fn() }))

import { POST } from "../route"
import { auth } from "@/lib/auth"
import { generateShippingDocument } from "@/lib/shopee/logistics"

const mockAuth = auth as any
const mockGenerate = generateShippingDocument as any

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/shopee/logistics/document", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any
}

describe("POST /api/shopee/logistics/document", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ orderSnList: [] }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when orderSnList is empty", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const res = await POST(makeRequest({ orderSnList: [] }))
    expect(res.status).toBe(400)
  })

  it("returns the PDF with an application/pdf content type", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGenerate.mockResolvedValue(Buffer.from("fake-pdf"))

    const res = await POST(makeRequest({ orderSnList: ["S1", "S2"] }))

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.toString()).toBe("fake-pdf")
  })

  it("returns 502 with Shopee's error message when generation fails", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGenerate.mockRejectedValue(new Error("Dokumen resi belum siap (timeout)"))

    const res = await POST(makeRequest({ orderSnList: ["S1"] }))

    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json).toEqual({ error: "Dokumen resi belum siap (timeout)" })
  })
})
