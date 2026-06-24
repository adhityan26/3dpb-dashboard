import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/discord/commands/invoice", () => ({
  handleInvoiceBuat: vi.fn().mockResolvedValue("BUAT_OK"),
  handleInvoiceStatus: vi.fn().mockResolvedValue("STATUS_OK"),
}))
vi.mock("@/lib/discord/commands/kalkulator", () => ({ handleKalkulator: vi.fn().mockResolvedValue("KALK_OK") }))
vi.mock("@/lib/discord/commands/shopee", () => ({ handleShopeeOrder: vi.fn() }))
vi.mock("@/lib/discord/commands/produk", () => ({ handleProdukCari: vi.fn() }))
vi.mock("@/lib/discord/commands/order", () => ({ handleOrderPerluCetak: vi.fn() }))
vi.mock("@/lib/discord/commands/stok", () => ({ handleStokFilament: vi.fn() }))

import { dispatchCommand } from "@/lib/discord/dispatch"

describe("dispatchCommand", () => {
  beforeEach(() => vi.clearAllMocks())

  it("routes invoice/buat subcommand", async () => {
    const r = await dispatchCommand({
      type: 2, token: "t",
      data: { name: "invoice", options: [{ name: "buat", options: [{ name: "buyer", value: "X" }] }] },
    } as any)
    expect(r).toBe("BUAT_OK")
  })

  it("routes top-level kalkulator", async () => {
    const r = await dispatchCommand({
      type: 2, token: "t",
      data: { name: "kalkulator", options: [{ name: "gramasi", value: 1 }] },
    } as any)
    expect(r).toBe("KALK_OK")
  })

  it("throws on unknown command", async () => {
    await expect(dispatchCommand({ type: 2, token: "t", data: { name: "nope" } } as any))
      .rejects.toThrow()
  })
})
