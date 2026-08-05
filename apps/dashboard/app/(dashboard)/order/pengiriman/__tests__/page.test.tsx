// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

vi.mock("@/lib/hooks/use-orders", () => ({
  useOrders: () => ({
    data: {
      orders: [
        { orderSn: "S1", shopeeStatus: "READY_TO_SHIP", items: [{ productName: "Vas Bunga" }], buyerUsername: "b1" },
        { orderSn: "S2", shopeeStatus: "READY_TO_SHIP", items: [{ productName: "Miniatur" }], buyerUsername: "b2" },
        { orderSn: "S3", shopeeStatus: "PROCESSED", items: [{ productName: "Sudah diproses" }], buyerUsername: "b3" },
      ],
    },
    isLoading: false,
    error: null,
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)
vi.stubGlobal("open", vi.fn())
// jsdom doesn't implement URL.createObjectURL — stub it so the
// generate-resi flow (blob -> object URL -> window.open) can run in tests.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = vi.fn(() => "blob:mock-url")
}

import PengirimanPage from "../page"

describe("Pengiriman Massal page", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("only lists READY_TO_SHIP orders (filters out PROCESSED)", () => {
    render(<PengirimanPage />)
    expect(screen.getByText(/S1/)).toBeInTheDocument()
    expect(screen.getByText(/S2/)).toBeInTheDocument()
    expect(screen.queryByText(/S3/)).not.toBeInTheDocument()
  })

  it("disables the arrange-shipment button until at least one order is selected", () => {
    render(<PengirimanPage />)
    expect(screen.getByRole("button", { name: /atur pengiriman/i })).toBeDisabled()
  })

  it("enables arrange-shipment once an order is checked, and posts to /api/shopee/logistics/ship", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ orderSn: "S1", success: true }] }),
    })

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /pickup/i }))

    const shipButton = screen.getByRole("button", { name: /atur pengiriman/i })
    expect(shipButton).not.toBeDisabled()
    fireEvent.click(shipButton)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/shopee/logistics/ship",
      expect.objectContaining({ method: "POST" }),
    ))
    await waitFor(() => expect(screen.getByText(/1 order berhasil diatur/i)).toBeInTheDocument())
  })

  it("shows the generate-resi button only after at least one order ships successfully, and opens the PDF in a new tab", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ orderSn: "S1", success: true }] }) })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["pdf"], { type: "application/pdf" }) })

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /pickup/i }))
    fireEvent.click(screen.getByRole("button", { name: /atur pengiriman/i }))
    await waitFor(() => screen.getByRole("button", { name: /generate.*cetak resi/i }))

    fireEvent.click(screen.getByRole("button", { name: /generate.*cetak resi/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/shopee/logistics/document",
      expect.objectContaining({ method: "POST" }),
    ))
    await waitFor(() => expect(window.open).toHaveBeenCalled())
  })

  it("shows an error message when the ship endpoint responds with a non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Sesi Shopee kadaluarsa" }),
    })

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /pickup/i }))
    fireEvent.click(screen.getByRole("button", { name: /atur pengiriman/i }))

    await waitFor(() => expect(screen.getByText(/sesi shopee kadaluarsa/i)).toBeInTheDocument())
    expect(screen.queryByText(/langkah 2/i)).not.toBeInTheDocument()
  })

  it("shows an error message when the ship fetch rejects with a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"))

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /pickup/i }))
    fireEvent.click(screen.getByRole("button", { name: /atur pengiriman/i }))

    await waitFor(() => expect(screen.getByText(/gagal mengatur pengiriman/i)).toBeInTheDocument())
  })

  it("fetches and shows branch options when drop-off is selected, and keeps arrange-shipment disabled until a branch is chosen", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pickup: null,
        dropoff: { branchList: [{ branchId: 1, address: "Cabang A" }, { branchId: 2, address: "Cabang B" }] },
      }),
    })

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /drop-off/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/shopee/logistics/parameter?orderSn=S1"))
    await waitFor(() => expect(screen.getByLabelText("Pilih cabang drop-off")).toBeInTheDocument())

    const shipButton = screen.getByRole("button", { name: /atur pengiriman/i })
    expect(shipButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Pilih cabang drop-off"), { target: { value: "2" } })
    expect(shipButton).not.toBeDisabled()
  })

  it("sends the chosen branchId in the ship request body for dropoff orders", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pickup: null,
          dropoff: { branchList: [{ branchId: 1, address: "Cabang A" }] },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ orderSn: "S1", success: true }] }) })

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /drop-off/i }))
    await waitFor(() => expect(screen.getByLabelText("Pilih cabang drop-off")).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText("Pilih cabang drop-off"), { target: { value: "1" } })

    fireEvent.click(screen.getByRole("button", { name: /atur pengiriman/i }))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/shopee/logistics/ship",
        expect.objectContaining({
          body: JSON.stringify({
            orders: [{ orderSn: "S1", method: { kind: "dropoff", branchId: 1 } }],
          }),
        }),
      ),
    )
  })

  it("shows a clear error when fetching branches fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Sesi Shopee kadaluarsa" }) })

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /drop-off/i }))

    await waitFor(() => expect(screen.getByText(/sesi shopee kadaluarsa/i)).toBeInTheDocument())
    expect(screen.getByRole("button", { name: /atur pengiriman/i })).toBeDisabled()
  })
})
