import type { ProductsListResult, ProductSummary } from "./types"

type MockBase = Omit<
  ProductSummary,
  "grossMargin30d" | "perluPerhatian" | "isStockLow" | "lowestStock"
>

const MOCK_PRODUCTS: MockBase[] = [
  {
    productId: "44208367025",
    name: "3D Print Crocs Charm Jibbitz Swoosh Multicolor Side Logo (Sepasang)",
    status: "NORMAL",
    imageUrl: null,
    hasVariants: true,
    stockTotal: 42,
    priceMin: 55000,
    priceMax: 85000,
    hpp: 15000,
    variants: [
      {
        variantId: "4420_red",
        variantName: "Merah",
        sku: "CR-RED-01",
        stock: 18,
        price: 55000,
        hpp: null,
      },
      {
        variantId: "4420_blue",
        variantName: "Biru",
        sku: "CR-BLU-01",
        stock: 3,
        price: 55000,
        hpp: null,
      },
      {
        variantId: "4420_gold",
        variantName: "Emas",
        sku: "CR-GLD-01",
        stock: 21,
        price: 85000,
        hpp: 22000,
      },
    ],
    qtySold30d: 820,
    omzet30d: 46500000,
  },
  {
    productId: "25843382450",
    name: "3D Print Crocs Charm Jibbitz Swoosh Side Logo (Sepasang)",
    status: "NORMAL",
    imageUrl: null,
    hasVariants: true,
    stockTotal: 15,
    priceMin: 50000,
    priceMax: 65000,
    hpp: 14000,
    variants: [
      {
        variantId: "2584_black",
        variantName: "Hitam",
        sku: "CR-BLK-01",
        stock: 12,
        price: 50000,
        hpp: null,
      },
      {
        variantId: "2584_white",
        variantName: "Putih",
        sku: "CR-WHT-01",
        stock: 3,
        price: 65000,
        hpp: null,
      },
    ],
    qtySold30d: 365,
    omzet30d: 15800000,
  },
  {
    productId: "45456308203",
    name: "Aksesoris Sendal Fire Wave - 3D Print",
    status: "NORMAL",
    imageUrl: null,
    hasVariants: false,
    stockTotal: 85,
    priceMin: 45000,
    priceMax: 45000,
    hpp: 12000,
    variants: [],
    qtySold30d: 560,
    omzet30d: 30200000,
  },
  {
    productId: "57853989766",
    name: "3D Print Aksesoris Sendal Dudukan Samping",
    status: "NORMAL",
    imageUrl: null,
    hasVariants: false,
    stockTotal: 2,
    priceMin: 55000,
    priceMax: 55000,
    hpp: null,
    variants: [],
    qtySold30d: 275,
    omzet30d: 14800000,
  },
  {
    productId: "53056307241",
    name: "3D Print MF Doom Mask Keychain",
    status: "NORMAL",
    imageUrl: null,
    hasVariants: false,
    stockTotal: 50,
    priceMin: 22500,
    priceMax: 22500,
    hpp: 8000,
    variants: [],
    qtySold30d: 1,
    omzet30d: 22500,
  },
  {
    productId: "49707944005",
    name: "Nightwing Inspired Pin",
    status: "UNLIST",
    imageUrl: null,
    hasVariants: false,
    stockTotal: 20,
    priceMin: 18000,
    priceMax: 18000,
    hpp: null,
    variants: [],
    qtySold30d: 0,
    omzet30d: 0,
  },
]

export function generateMockProducts(): ProductsListResult {
  const products: ProductSummary[] = MOCK_PRODUCTS.map((p) => {
    const stocks = p.hasVariants
      ? p.variants.map((v) => v.stock)
      : [p.stockTotal]
    const lowestStock = stocks.length > 0 ? Math.min(...stocks) : 0
    const isStockLow = lowestStock < 5
    const noSalesRecent = p.qtySold30d === 0
    const perluPerhatian = isStockLow || noSalesRecent

    let grossMargin30d: number | null = null
    if (p.hpp !== null) {
      grossMargin30d = p.omzet30d - p.hpp * p.qtySold30d
    }

    return {
      ...p,
      lowestStock,
      isStockLow,
      perluPerhatian,
      grossMargin30d,
    }
  })

  products.sort((a, b) => {
    if (a.perluPerhatian !== b.perluPerhatian) {
      return a.perluPerhatian ? -1 : 1
    }
    return b.omzet30d - a.omzet30d
  })

  const stokKritis = products.filter((p) => p.isStockLow).length
  const perluPerhatian = products.filter((p) => p.perluPerhatian).length
  const totalStockItems = products.reduce((s, p) => s + p.stockTotal, 0)

  return {
    products,
    kpi: {
      totalProducts: products.length,
      stokKritis,
      perluPerhatian,
      totalStockItems,
    },
    fetchedAt: new Date().toISOString(),
  }
}
