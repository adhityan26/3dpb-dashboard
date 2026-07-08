import { sanityRead, sanityWrite } from '@/lib/sanity/client'
import type { SanityKeycapOrder, KeycapStatus } from '@/lib/sanity/types'

const FIELDS = `
  _id, orderNumber, status, submittedAt,
  customerName, customerPhone, qty, orientation,
  bodyColor { name, hex },
  keys[] { _key, position, char, font, baseColor { name, hex }, textColor { name, hex } },
  adminNotes, statusNote
`

export async function fetchAllKeycapOrders(): Promise<SanityKeycapOrder[]> {
  return sanityRead.fetch<SanityKeycapOrder[]>(
    `*[_type == "keycapOrder"] | order(submittedAt desc) { ${FIELDS} }`,
  )
}

export async function fetchPendingKeycapOrders(): Promise<SanityKeycapOrder[]> {
  return sanityRead.fetch<SanityKeycapOrder[]>(
    `*[_type == "keycapOrder" && status == "pending"] | order(submittedAt desc) { ${FIELDS} }`,
  )
}

export async function fetchKeycapOrderById(id: string): Promise<SanityKeycapOrder | null> {
  return sanityRead.fetch<SanityKeycapOrder | null>(
    `*[_type == "keycapOrder" && _id == $id][0] { ${FIELDS} }`,
    { id },
  )
}

export async function countPendingKeycapOrders(): Promise<number> {
  return sanityRead.fetch<number>(
    `count(*[_type == "keycapOrder" && status == "pending"])`,
  )
}

export async function patchKeycapOrderStatus(
  sanityDocId: string,
  status: KeycapStatus,
  statusNote?: string | null,
): Promise<void> {
  let patch = sanityWrite.patch(sanityDocId).set({ status })
  if (statusNote !== undefined) {
    patch = patch.set({ statusNote: statusNote ?? '' })
  }
  await patch.commit()
}
