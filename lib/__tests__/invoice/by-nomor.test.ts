import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: { quotation: { findUnique: vi.fn(), findFirst: vi.fn() } },
}))

import { prisma } from "@/lib/db"
import { getQuotationByNomor } from "@/lib/invoice/service"

const mock = prisma as any

describe("getQuotationByNomor", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when not found", async () => {
    mock.quotation.findFirst.mockResolvedValue(null)
    expect(await getQuotationByNomor("INV-X")).toBeNull()
  })

  it("queries by nomor", async () => {
    mock.quotation.findFirst.mockResolvedValue(null)
    await getQuotationByNomor("INV-1")
    expect(mock.quotation.findFirst.mock.calls[0][0].where.nomor).toBe("INV-1")
  })
})
