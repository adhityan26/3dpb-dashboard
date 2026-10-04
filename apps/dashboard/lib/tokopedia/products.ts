import { listOrders, type TokopediaTab } from "./orders"
import { parseOrder } from "./parse"

// There is no Tokopedia Seller Center "list all products" endpoint wired up
// in this codebase (unlike Shopee's item/get_item_list) — only order data.
// So the "catalog" here is derived from product names seen on recent real
// orders instead: good enough for the Working Project keyword-grouping
// picker (Settings > Jadwal Kirim), which only needs product names that
// actually get ordered, not a full live product list.
const SCAN_TABS: TokopediaTab[] = ["selesai", "dikirim"]
const PAGE_SIZE = 50
const PAGE_GAP_MS = 400
const MAX_PAGES_PER_TAB = 4 // up to 200 orders/tab — enough recent variety without being slow

export async function getRecentTokopediaProductNames(): Promise<string[]> {
  const names = new Set<string>()
  for (const tab of SCAN_TABS) {
    let offset = 0
    for (let page = 0; page < MAX_PAGES_PER_TAB; page++) {
      const raw = await listOrders(tab, { count: PAGE_SIZE, offset })
      const orders = raw.main_orders ?? [] // an empty tab returns no main_orders at all
      for (const order of orders) {
        for (const product of parseOrder(order).products) {
          if (product.name) names.add(product.name)
        }
      }
      if (orders.length < PAGE_SIZE) break
      offset += PAGE_SIZE
      await new Promise((r) => setTimeout(r, PAGE_GAP_MS)) // avoid triggering Tokopedia's captcha challenge
    }
  }
  return [...names]
}
