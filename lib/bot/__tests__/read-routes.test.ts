import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/products/service", () => ({ getProductsPage: vi.fn() }))
vi.mock("@/lib/orders/service", () => ({ getReadyToShipOrders: vi.fn() }))
vi.mock("@/lib/filamen/spool-service", () => ({ listSpools: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { GET as produkGET } from "@/app/api/bot/produk/route"
import { GET as orderGET } from "@/app/api/bot/order/perlu-cetak/route"
import { GET as stokGET } from "@/app/api/bot/stok/filament/route"
import { getProductsPage } from "@/lib/products/service"
import { getReadyToShipOrders } from "@/lib/orders/service"
import { listSpools } from "@/lib/filamen/spool-service"
import { requireBotToken } from "@/lib/bot/auth"

const mockProducts = getProductsPage as any
const mockOrders = getReadyToShipOrders as any
const mockSpools = listSpools as any
const mockAuth = requireBotToken as any
const reqUrl = (url: string) => ({ headers: { get: () => "Bearer x" }, url } as any)

describe("GET /api/bot/produk", () => {
  beforeEach(() => vi.clearAllMocks())
  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await produkGET(reqUrl("http://x/api/bot/produk?q=key"))
    expect(res.status).toBe(401)
  })
  it("returns mapped products", async () => {
    mockAuth.mockReturnValue(true)
    mockProducts.mockResolvedValue({ total: 1, products: [
      { name: "Keychain", priceMin: 15000, priceMax: 15000, hpp: 5000, grossMargin30d: 40, stockTotal: 12 },
    ] })
    const res = await produkGET(reqUrl("http://x/api/bot/produk?q=key"))
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.products[0]).toEqual({ name: "Keychain", priceMin: 15000, priceMax: 15000, hpp: 5000, margin: 40, stock: 12 })
    expect(mockProducts.mock.calls[0][0]).toMatchObject({ q: "key", page: 1, limit: 5, status: "all" })
  })
})

describe("GET /api/bot/order/perlu-cetak", () => {
  beforeEach(() => vi.clearAllMocks())
  it("returns only not-yet-printed orders", async () => {
    mockAuth.mockReturnValue(true)
    mockOrders.mockResolvedValue({ orders: [
      { orderSn: "A", shopeeStatus: "PROCESSED", buyerUsername: "budi", labelPrinted: false },
      { orderSn: "B", shopeeStatus: "PROCESSED", buyerUsername: "siti", labelPrinted: true },
    ] })
    const res = await orderGET(reqUrl("http://x/api/bot/order/perlu-cetak"))
    const body = await res.json()
    expect(body.count).toBe(1)
    expect(body.orders).toEqual([{ orderSn: "A", status: "PROCESSED", buyer: "budi" }])
  })
})

describe("GET /api/bot/stok/filament", () => {
  beforeEach(() => vi.clearAllMocks())
  it("groups non-empty spools by brand+material, filtered by brand", async () => {
    mockAuth.mockReturnValue(true)
    mockSpools.mockResolvedValue({ spools: [
      { brand: "Sunlu", material: "PLA", status: "full" },
      { brand: "Sunlu", material: "PLA", status: "low" },
      { brand: "Sunlu", material: "ABS", status: "empty" },
      { brand: "eSun", material: "PLA", status: "full" },
    ] })
    const res = await stokGET(reqUrl("http://x/api/bot/stok/filament?brand=sunlu"))
    const body = await res.json()
    expect(body.groups).toEqual([{ key: "Sunlu PLA", count: 2 }])
  })
})
