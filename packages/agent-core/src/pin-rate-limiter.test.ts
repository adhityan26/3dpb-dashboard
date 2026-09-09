import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PinRateLimiter } from "./pin-rate-limiter";

describe("PinRateLimiter", () => {
  let limiter: PinRateLimiter;

  beforeEach(() => {
    limiter = new PinRateLimiter();
  });

  it("PIN benar -> ok:true, locked:false", () => {
    expect(limiter.check("1.2.3.4", "1234", "1234")).toEqual({ ok: true, locked: false });
  });

  it("PIN salah -> ok:false, locked:false", () => {
    expect(limiter.check("1.2.3.4", "wrong", "1234")).toEqual({ ok: false, locked: false });
  });

  it("loopback (127.0.0.1) TIDAK PERNAH kena rate limit walau salah berkali-kali", () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("127.0.0.1", "wrong", "1234")).toEqual({ ok: false, locked: false });
    }
  });

  it("::1 (IPv6 loopback) juga exempt", () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("::1", "wrong", "1234")).toEqual({ ok: false, locked: false });
    }
  });

  it("non-loopback: 5 kali salah -> attempt ke-6 locked:true", () => {
    for (let i = 0; i < 5; i++) {
      limiter.check("9.9.9.9", "wrong", "1234");
    }
    expect(limiter.check("9.9.9.9", "wrong", "1234")).toEqual({ ok: false, locked: true });
  });

  it("locked entry: mencoba PIN BENAR selagi locked tetap ditolak (tidak dicek sama sekali)", () => {
    for (let i = 0; i < 5; i++) {
      limiter.check("9.9.9.9", "wrong", "1234");
    }
    expect(limiter.check("9.9.9.9", "1234", "1234")).toEqual({ ok: false, locked: true });
  });

  it("sukses menghapus entry rate-limit (bukan cuma reset count ke 0)", () => {
    limiter.check("9.9.9.9", "wrong", "1234");
    limiter.check("9.9.9.9", "wrong", "1234");
    limiter.check("9.9.9.9", "1234", "1234"); // sukses, entry harus dihapus
    // budget MAX_ATTEMPTS penuh lagi setelah sukses
    for (let i = 0; i < 4; i++) {
      expect(limiter.check("9.9.9.9", "wrong", "1234").locked).toBe(false);
    }
  });

  it("cooldown habis -> fresh start dengan budget MAX_ATTEMPTS penuh, bukan sisa count lama", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      limiter.check("9.9.9.9", "wrong", "1234");
    }
    expect(limiter.check("9.9.9.9", "wrong", "1234").locked).toBe(true);
    vi.advanceTimersByTime(60_001);
    // cooldown habis: 5 kali salah lagi harus TIDAK locked sampai call ke-6 (budget baru, bukan 5+5=10)
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("9.9.9.9", "wrong", "1234").locked).toBe(false);
    }
    expect(limiter.check("9.9.9.9", "wrong", "1234").locked).toBe(true); // ke-6 dalam periode baru -> locked
    vi.useRealTimers();
  });

  it("lockout satu alamat non-loopback TIDAK memengaruhi alamat lain", () => {
    for (let i = 0; i < 5; i++) {
      limiter.check("9.9.9.9", "wrong", "1234");
    }
    expect(limiter.check("9.9.9.9", "1234", "1234").locked).toBe(true); // ATTACKER terkunci
    expect(limiter.check("8.8.8.8", "1234", "1234")).toEqual({ ok: true, locked: false }); // OTHER tidak terpengaruh
  });

  it("::ffff:127.0.0.1 (IPv4-mapped IPv6) dianggap loopback juga", () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("::ffff:127.0.0.1", "wrong", "1234").locked).toBe(false);
    }
  });
});
