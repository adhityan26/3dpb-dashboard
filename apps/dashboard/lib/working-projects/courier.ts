// Which couriers count as "fast pickup" (Anteraja/Paxel/Grab/Gojek pick up
// same-day/next-morning) vs "regular" (SPX/J&T/JNE, slower pickup) — used by
// the shipping-schedule view to surface what to pack first each day.
// Configurable in Settings (Config-backed, see getFastCouriers/
// setFastCouriers in service.ts) rather than hardcoded, since the courier
// mix and what counts as "fast" can change.
export const DEFAULT_FAST_COURIERS = ['anteraja', 'paxel', 'grab', 'gojek', 'gosend'] as const

/** Case-insensitive substring match against the configured fast-courier keywords. */
export function isFastCourier(shipping: string | null | undefined, fastCouriers: string[]): boolean {
  if (!shipping) return false
  const s = shipping.toLowerCase()
  return fastCouriers.some((keyword) => {
    const k = keyword.trim().toLowerCase()
    return k.length > 0 && s.includes(k)
  })
}
