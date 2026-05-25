import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import type { SanityLgOrder } from "./types"

/**
 * Convert a Sanity asset _ref like "image-abc123-800x600-png"
 * to a Sanity CDN URL: https://cdn.sanity.io/images/{project}/{dataset}/abc123-800x600.png
 */
export function sanityAssetRefToUrl(ref: string): string {
  const projectId = process.env.SANITY_PROJECT_ID ?? "placeholder"
  const dataset = process.env.SANITY_DATASET ?? "production"
  // Strip "image-" prefix, replace last "-" before extension with "."
  const withoutPrefix = ref.replace(/^image-/, "")
  const filename = withoutPrefix.replace(/-([a-z0-9]+)$/, ".$1")
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${filename}`
}

/** Fetch pending Sanity LG orders (status == "submitted") */
export async function fetchSanityPendingOrders(): Promise<SanityLgOrder[]> {
  return sanityRead.fetch<SanityLgOrder[]>(
    `*[_type == "lightGeneratorOrder" && status == "submitted"] | order(submittedAt desc) {
      _id, orderId, status, customerName, customerContact, customerNotes,
      size, shape, shapeRatio, shadowDiameter, shadowOffsetX, shadowOffsetY, supportStems,
      silhouetteImage { asset { _ref } },
      floorInsertImage { asset { _ref } },
      submittedAt
    }`,
  )
}

/** Fetch ALL Sanity LG orders regardless of status */
export async function fetchAllSanityLgOrders(): Promise<SanityLgOrder[]> {
  return sanityRead.fetch<SanityLgOrder[]>(
    `*[_type == "lightGeneratorOrder"] | order(submittedAt desc) {
      _id, orderId, status, customerName, customerContact, customerNotes,
      size, shape, shapeRatio, shadowDiameter, shadowOffsetX, shadowOffsetY, supportStems,
      silhouetteImage { asset { _ref } },
      floorInsertImage { asset { _ref } },
      submittedAt
    }`,
  )
}

/**
 * Count Sanity LG orders that have NOT yet been confirmed (copied to local DB).
 * Used for the badge count in /api/cms/counts.
 */
export async function countUnconfirmedSanityLgOrders(): Promise<number> {
  const { prisma } = await import("@/lib/db")
  const sanityOrders = await sanityRead.fetch<Array<{ orderId: string }>>(
    `*[_type == "lightGeneratorOrder"]{ orderId }`,
  )
  if (sanityOrders.length === 0) return 0
  const confirmed = await prisma.lightGeneratorOrder.count({
    where: { id: { in: sanityOrders.map((o) => o.orderId) } },
  })
  return sanityOrders.length - confirmed
}

/** Fetch a single Sanity LG order by orderId */
export async function fetchSanityOrderById(orderId: string): Promise<SanityLgOrder | null> {
  return sanityRead.fetch<SanityLgOrder | null>(
    `*[_type == "lightGeneratorOrder" && orderId == $orderId][0] {
      _id, orderId, status, customerName, customerContact, customerNotes,
      size, shape, shapeRatio, shadowDiameter, shadowOffsetX, shadowOffsetY, supportStems,
      silhouetteImage { asset { _ref } },
      floorInsertImage { asset { _ref } },
      submittedAt
    }`,
    { orderId },
  )
}

/** Patch status and optional statusNote back to Sanity */
export async function patchSanityOrderStatus(
  sanityDocId: string,
  status: string,
  statusNote?: string | null,
): Promise<void> {
  let patch = sanityWrite.patch(sanityDocId).set({ status })
  if (statusNote !== undefined) {
    patch = patch.set({ statusNote: statusNote ?? "" })
  }
  await patch.commit()
}
