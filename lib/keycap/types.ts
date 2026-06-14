export type {
  KeycapOrder,
  SanityKeycapOrder,
  KeycapStatus,
  KeycapKeyConfig,
  FilamentColorRef,
} from '@/lib/sanity/types'

export const KEYCAP_STATUS_LABELS: Record<string, string> = {
  pending: '🆕 Pending',
  confirmed: '✅ Confirmed',
  printing: '🖨️ Printing',
  done: '📦 Done',
  cancelled: '❌ Cancelled',
}
