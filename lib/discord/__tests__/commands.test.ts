import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/invoice/service", () => ({
  createQuotation: vi.fn(),
  getQuotationByNomor: vi.fn(),
}))
vi.mock("@/lib/kalkulator/rates", () => ({ loadRates: vi.fn() }))

import { handleInvoiceBuat, handleInvoiceStatus } from "@/lib/discord/commands/invoice"
import { handleKalkulator } from "@/lib/discord/commands/kalkulator"
import { createQuotation, getQuotationByNomor } from "@/lib/invoice/service"
import { loadRates } from "@/lib/kalkulator/rates"

const mockCreate = createQuotation as any
const mockByNomor = getQuotationByNomor as any
const mockRates = loadRates as any

describe("handleInvoiceBuat", () => {
  beforeEach(() => vi.clearAllMocks())

  it("replies with an error and does NOT create when items are malformed", async () => {
    const reply = await handleInvoiceBuat([
      { name: "buyer", value: "Budi" },
      { name: "items", value: "Keychain|2" },
    ])
    expect(reply.toLowerCase()).toContain("format")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("creates the invoice and replies with nomor + total on valid input", async () => {
    mockCreate.mockResolvedValue({ nomor: "INV-1", total: 30000 })
    const reply = await handleInvoiceBuat([
      { name: "buyer", value: "Budi" },
      { name: "items", value: "Keychain|2|15000" },
      { name: "ongkir", value: 5000 },
    ])
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const arg = mockCreate.mock.calls[0][0]
    expect(arg.buyerNama).toBe("Budi")
    expect(arg.ongkir).toBe(5000)
    expect(arg.items).toHaveLength(1)
    expect(reply).toContain("INV-1")
    expect(reply).toContain("Rp 30.000")
  })
})

describe("handleInvoiceStatus", () => {
  beforeEach(() => vi.clearAllMocks())

  it("replies not-found when nomor missing", async () => {
    mockByNomor.mockResolvedValue(null)
    const reply = await handleInvoiceStatus([{ name: "nomor", value: "INV-X" }])
    expect(reply.toLowerCase()).toContain("tidak ditemukan")
  })

  it("replies with status, total, paid, sisa", async () => {
    mockByNomor.mockResolvedValue({ nomor: "INV-1", status: "PARTIAL", total: 30000, totalPaid: 10000, sisaBayar: 20000 })
    const reply = await handleInvoiceStatus([{ name: "nomor", value: "INV-1" }])
    expect(reply).toContain("INV-1")
    expect(reply).toContain("Rp 20.000")
  })
})

describe("handleKalkulator", () => {
  beforeEach(() => vi.clearAllMocks())

  it("computes prices from gramasi/jam and replies", async () => {
    mockRates.mockResolvedValue({
      fdmHppPerGram: 300, slaHppPerGram: 800, fdmJualPerGram: 500, slaJualPerGram: 1200,
      mesinPerJam: 1000, adminEcommerce: 0.8, failureRatePct: 12, failureSpreadPct: 50,
      testLayerPct: 5, packing: {}, gantungan: {}, switchPerPcs: 0, labelPerLembar: 0,
    })
    const reply = await handleKalkulator([
      { name: "gramasi", value: 50 },
      { name: "jam", value: 2 },
      { name: "tipe", value: "FDM" },
      { name: "tier", value: "A" },
    ])
    expect(reply).toContain("HPP")
    expect(reply).toMatch(/Rp/)
  })
})
