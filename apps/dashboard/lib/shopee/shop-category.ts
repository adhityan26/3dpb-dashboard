import { shopeeRequest } from "./client"
import type {
  ShopeeShopCategory,
  ShopeeShopCategoryListResponse,
  ShopeeShopCategoryItemListResponse,
} from "./types"

const MAX_PAGES = 20

/**
 * List all shop categories (etalase/showcase), paginated.
 */
export async function getShopCategoryList(): Promise<ShopeeShopCategory[]> {
  const all: ShopeeShopCategory[] = []
  let pageNo = 1
  let safety = 0

  while (safety < MAX_PAGES) {
    const json = await shopeeRequest<ShopeeShopCategoryListResponse>(
      "/api/v2/shop_category/get_shop_category_list",
      { page_no: pageNo, page_size: 100 },
    )
    // Shopee's field is misspelled ("shop_categorys"); accept both variants.
    const entries =
      json.response.shop_categorys ?? json.response.shop_category_list ?? []
    all.push(...entries)

    safety++
    if (!json.response.more) break
    pageNo++
  }

  return all
}

/**
 * List item ids for a single shop category, paginated.
 */
export async function getShopCategoryItems(
  shopCategoryId: number,
): Promise<{ itemIds: number[]; total: number }> {
  const itemIds: number[] = []
  let pageNo = 1
  let total = 0
  let safety = 0

  while (safety < MAX_PAGES) {
    const json = await shopeeRequest<ShopeeShopCategoryItemListResponse>(
      "/api/v2/shop_category/get_item_list",
      { shop_category_id: shopCategoryId, page_size: 100, page_no: pageNo },
    )
    itemIds.push(...(json.response.item_list ?? []))
    total = json.response.total_count ?? itemIds.length

    safety++
    if (!json.response.more) break
    pageNo++
  }

  return { itemIds, total }
}
