// Diekstrak dari apps/agent/src/main/broker.ts (checkPin + rate-limit Map + normalizeAddress
// + isLoopback) supaya bisa dites langsung tanpa buka socket TCP, dan supaya LocalBroker bisa
// bikin instance baru per start() alih-alih state module-level yang tak pernah direset kecuali
// lewat hook khusus test.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

interface RateLimitEntry {
  count: number;
  lockedUntil: number;
}

/**
 * Normalisasi `::ffff:127.0.0.1` (IPv4-mapped IPv6, bentuk umum saat dual-stack listen)
 * jadi `127.0.0.1`. Alamat native IPv6 loopback `::1` TIDAK punya prefix ini -- dicek
 * terpisah di isLoopback.
 */
function normalizeAddress(raw: string | undefined): string {
  if (!raw) return "";
  return raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
}

function isLoopback(normalizedAddr: string): boolean {
  return normalizedAddr === "127.0.0.1" || normalizedAddr === "::1";
}

export class PinRateLimiter {
  private rateLimitMap = new Map<string, RateLimitEntry>();

  /**
   * `addr` boleh mentah (belum dinormalisasi) -- normalisasi dilakukan di sini, bukan caller.
   */
  check(rawAddr: string, presentedPassword: string, pin: string): { ok: boolean; locked: boolean } {
    const addr = normalizeAddress(rawAddr);
    const loopback = isLoopback(addr);
    const now = Date.now();

    if (!loopback) {
      const entry = this.rateLimitMap.get(addr);
      if (entry && entry.lockedUntil > 0) {
        if (now < entry.lockedUntil) {
          // Locked -- JANGAN bandingkan PIN, JANGAN sentuh counter/lockedUntil. Kalau tidak,
          // retry-loop legit (mis. CYD reconnect tiap beberapa detik) bisa memperpanjang
          // lockout dirinya sendiri tanpa akhir.
          return { ok: false, locked: true };
        }
        // Cooldown sudah habis -- fresh start, budget penuh MAX_ATTEMPTS lagi, bukan sisa count lama.
        this.rateLimitMap.delete(addr);
      }
    }

    if (presentedPassword === pin) {
      if (!loopback) this.rateLimitMap.delete(addr); // sukses -- buang entry, jangan cuma reset ke 0
      return { ok: true, locked: false };
    }

    if (!loopback) {
      const entry = this.rateLimitMap.get(addr) ?? { count: 0, lockedUntil: 0 };
      entry.count += 1;
      if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
      this.rateLimitMap.set(addr, entry);
    }
    return { ok: false, locked: false };
  }
}
