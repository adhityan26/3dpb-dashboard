import { shopeeRequest } from "./client"

interface TrackingNumberResponse {
  response: {
    tracking_number?: string
  }
}

/**
 * Fetch the courier tracking number for an order.
 * Returns null (not a throw) when the order has no tracking number yet
 * (e.g. not shipped) or the Shopee API call fails for that reason.
 */
export async function getTrackingNumber(orderSn: string): Promise<string | null> {
  try {
    const json = await shopeeRequest<TrackingNumberResponse>(
      "/api/v2/logistics/get_tracking_number",
      { order_sn: orderSn },
    )
    return json.response.tracking_number || null
  } catch (err) {
    console.warn(`[shopee] getTrackingNumber failed for ${orderSn}:`, err instanceof Error ? err.message : err)
    return null
  }
}
