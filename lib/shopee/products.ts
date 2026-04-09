import { shopeeRequest } from "./client"
import type {
  ShopeeItemListResponse,
  ShopeeItemBaseInfoResponse,
  ShopeeItemBaseInfo,
  ShopeeModelListResponse,
  ShopeeItemStatus,
} from "./types"

/**
 * Paginate through all items for a SINGLE status.
 * Shopee's get_item_list accepts only one item_status value per call.
 */
async function getItemsForStatus(
  status: ShopeeItemStatus,
): Promise<Array<{ item_id: number; item_status: ShopeeItemStatus }>> {
  const all: Array<{ item_id: number; item_status: ShopeeItemStatus }> = []
  let offset = 0
  const pageSize = 100
  let safety = 0

  while (safety < 50) {
    const json = await shopeeRequest<ShopeeItemListResponse>(
      "/api/v2/product/get_item_list",
      {
        offset,
        page_size: pageSize,
        item_status: status,
      },
    )
    // Some API versions return `item`, others return `item_list`.
    // Empty shops return no array at all.
    const entries = json.response.item ?? json.response.item_list ?? []
    for (const entry of entries) {
      all.push({
        item_id: entry.item_id,
        item_status: entry.item_status ?? status,
      })
    }
    if (!json.response.has_next_page) break
    offset = json.response.next_offset ?? offset + pageSize
    safety++
  }

  return all
}

/**
 * Paginate through all items across multiple statuses.
 * Shopee requires one call per status, so we run them sequentially to stay
 * under rate limits.
 */
export async function getAllItems(
  itemStatuses: ShopeeItemStatus[] = ["NORMAL", "UNLIST"],
): Promise<Array<{ item_id: number; item_status: ShopeeItemStatus }>> {
  const all: Array<{ item_id: number; item_status: ShopeeItemStatus }> = []
  for (const status of itemStatuses) {
    const items = await getItemsForStatus(status)
    all.push(...items)
  }
  return all
}

/**
 * Get base info for up to 50 items at once. Batches automatically.
 */
export async function getItemBaseInfoBatch(
  itemIds: number[],
): Promise<ShopeeItemBaseInfo[]> {
  if (itemIds.length === 0) return []

  const all: ShopeeItemBaseInfo[] = []
  for (let i = 0; i < itemIds.length; i += 50) {
    const batch = itemIds.slice(i, i + 50)
    const json = await shopeeRequest<ShopeeItemBaseInfoResponse>(
      "/api/v2/product/get_item_base_info",
      {
        item_id_list: batch.join(","),
      },
    )
    all.push(...json.response.item_list)
  }

  return all
}

/**
 * Get variant (model) list for a single item.
 */
export async function getModelList(
  itemId: number,
): Promise<ShopeeModelListResponse["response"]> {
  const json = await shopeeRequest<ShopeeModelListResponse>(
    "/api/v2/product/get_model_list",
    { item_id: itemId },
  )
  return json.response
}
