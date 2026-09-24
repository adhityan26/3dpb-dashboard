// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { printShippingLabel } from "../ShippingLabelPrint"
import type { QuotationData, SenderInfo } from "@/lib/invoice/types"

function makeInvoice(overrides: Partial<QuotationData> = {}): QuotationData {
  return {
    id: "q1",
    nomor: "INV-20260907-004",
    buyerNama: "Budi Santoso",
    buyerContact: "0813-2222-3333",
    buyerAlamat: "Jl. Merdeka No. 45, Bandung",
    catatan: null,
    status: "SENT",
    tanggal: "2026-09-07T00:00:00.000Z",
    dueDate: null,
    ongkir: 0,
    diskonGlobal: 0,
    diskonGlobalPct: null,
    shopeeOrderSn: null,
    items: [
      { id: "i1", quotationId: "q1", produkInternalId: null, namaProduk: "Helmet Doctor Doom", qty: 1, hargaPerUnit: 500000, channelHarga: "offline", catatan: null, diskon: 0, diskonPct: null, subtotal: 500000 },
      { id: "i2", quotationId: "q1", produkInternalId: null, namaProduk: "Gantungan kunci custom", qty: 3, hargaPerUnit: 20000, channelHarga: "offline", catatan: null, diskon: 0, diskonPct: null, subtotal: 60000 },
    ],
    payments: [],
    subtotalProduk: 560000,
    total: 560000,
    totalPaid: 0,
    sisaBayar: 560000,
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    ...overrides,
  }
}

const sender: SenderInfo = { nama: "3D Printing Bandung", telepon: "0812-3456-7890", alamat: "Jl. Contoh No. 123, Bandung" }

describe("printShippingLabel", () => {
  let written = ""
  let mockWin: { document: { write: (h: string) => void; close: () => void }; focus: () => void; print: () => void }

  beforeEach(() => {
    written = ""
    mockWin = {
      document: { write: (h: string) => { written = h }, close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    }
    vi.spyOn(window, "open").mockReturnValue(mockWin as unknown as Window)
    vi.useFakeTimers()
  })

  it("includes recipient name, address, phone, item list, and invoice number", () => {
    printShippingLabel(makeInvoice(), sender)
    vi.runAllTimers()
    expect(written).toContain("Budi Santoso")
    expect(written).toContain("Jl. Merdeka No. 45, Bandung")
    expect(written).toContain("0813-2222-3333")
    expect(written).toContain("Helmet Doctor Doom")
    expect(written).toContain("x1")
    expect(written).toContain("Gantungan kunci custom")
    expect(written).toContain("x3")
    expect(written).toContain("INV-20260907-004")
  })

  it("includes sender name, phone, and address", () => {
    printShippingLabel(makeInvoice(), sender)
    vi.runAllTimers()
    expect(written).toContain("3D Printing Bandung")
    expect(written).toContain("0812-3456-7890")
    expect(written).toContain("Jl. Contoh No. 123, Bandung")
  })

  it("sets A6 page size for thermal printing", () => {
    printShippingLabel(makeInvoice(), sender)
    vi.runAllTimers()
    expect(written).toContain("size: 105mm 148mm")
  })

  it("escapes HTML special characters in buyer name to prevent injection into the print document", () => {
    printShippingLabel(makeInvoice({ buyerNama: "<script>alert(1)</script>" }), sender)
    vi.runAllTimers()
    expect(written).not.toContain("<script>alert(1)</script>")
    expect(written).toContain("&lt;script&gt;")
  })

  it("triggers print() after writing the document", () => {
    printShippingLabel(makeInvoice(), sender)
    vi.runAllTimers()
    expect(mockWin.print).toHaveBeenCalled()
  })

  it("does nothing if window.open is blocked (returns null)", () => {
    vi.spyOn(window, "open").mockReturnValue(null)
    expect(() => printShippingLabel(makeInvoice(), sender)).not.toThrow()
  })

  it("prints the AWB block only when an AWB is given", () => {
    printShippingLabel(makeInvoice(), sender, " JP1234567890 ")
    expect(written).toContain("No. Resi / AWB")
    expect(written).toContain("JP1234567890")
    written = ""
    printShippingLabel(makeInvoice(), sender)
    expect(written).not.toContain("No. Resi / AWB")
  })
})
