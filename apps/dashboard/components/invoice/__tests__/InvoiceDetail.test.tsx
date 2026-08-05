// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const mockInvoice = {
  id: "inv1",
  nomor: "INV-001",
  buyerNama: "Buyer Test",
  buyerContact: null,
  catatan: null,
  status: "SENT",
  tanggal: "2026-08-01",
  dueDate: null,
  ongkir: 0,
  diskonGlobal: 0,
  diskonGlobalPct: null,
  shopeeOrderSn: null,
  items: [],
  payments: [],
  subtotalProduk: 50000,
  total: 50000,
  totalPaid: 0,
  sisaBayar: 50000,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
}

vi.mock("@/lib/hooks/use-invoice", () => ({
  useInvoice: () => ({ data: mockInvoice, isLoading: false }),
  usePaymentMethods: () => ({ data: [] }),
  useInvoiceBankAccount: () => ({ data: null }),
  useInvoiceQris: vi.fn(),
  useUpdateInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async (_payload: string) => "data:image/png;base64,DYNAMIC") },
}))

vi.mock("@/lib/invoice/qris", () => ({
  buildDynamicQris: vi.fn((_payload: string, amount: number) => `dynamic-payload-for-${amount}`),
}))

import { InvoiceDetail } from "../InvoiceDetail"
import { useInvoiceQris } from "@/lib/hooks/use-invoice"
import QRCode from "qrcode"
import { buildDynamicQris } from "@/lib/invoice/qris"

const mockUseInvoiceQris = vi.mocked(useInvoiceQris)
const mockToDataURL = QRCode.toDataURL as any
const mockBuildDynamicQris = buildDynamicQris as any

const QRIS_WITH_PAYLOAD = {
  data: { qris: "data:image/png;base64,STATIC", qrisPayload: "000201010211...6304ABCD" },
} as any

describe("InvoiceDetail QRIS amount input", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInvoiceQris.mockReturnValue(QRIS_WITH_PAYLOAD)
  })

  it("defaults the amount input to sisaBayar", () => {
    render(<InvoiceDetail invoiceId="inv1" onBack={() => {}} />)
    const input = screen.getByLabelText(/jumlah qris/i) as HTMLInputElement
    expect(input.value).toBe("50000")
  })

  it("shows the static QRIS image when the amount is cleared", async () => {
    render(<InvoiceDetail invoiceId="inv1" onBack={() => {}} />)
    const input = screen.getByLabelText(/jumlah qris/i)
    fireEvent.change(input, { target: { value: "" } })
    await waitFor(() => {
      const img = screen.getByAltText("QRIS") as HTMLImageElement
      expect(img.src).toContain("STATIC")
    })
  })

  it("generates and shows a dynamic QR image when an amount is entered", async () => {
    mockToDataURL.mockResolvedValue("data:image/png;base64,DYNAMIC")
    render(<InvoiceDetail invoiceId="inv1" onBack={() => {}} />)
    const input = screen.getByLabelText(/jumlah qris/i)
    fireEvent.change(input, { target: { value: "75000" } })

    await waitFor(() => {
      expect(mockBuildDynamicQris).toHaveBeenCalledWith("000201010211...6304ABCD", 75000)
    })
    await waitFor(() => {
      const img = screen.getByAltText("QRIS") as HTMLImageElement
      expect(img.src).toContain("DYNAMIC")
    })
  })

  it("disables the amount input when qrisPayload is unavailable", () => {
    mockUseInvoiceQris.mockReturnValue({
      data: { qris: "data:image/png;base64,STATIC", qrisPayload: null },
    } as any)
    render(<InvoiceDetail invoiceId="inv1" onBack={() => {}} />)
    const input = screen.getByLabelText(/jumlah qris/i) as HTMLInputElement
    expect(input).toBeDisabled()
  })
})
