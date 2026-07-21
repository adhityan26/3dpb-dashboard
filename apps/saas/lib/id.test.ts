import { describe, it, expect, afterEach } from "vitest";
import { newId } from "./id";

const asli = globalThis.crypto;
afterEach(() => { Object.defineProperty(globalThis, "crypto", { value: asli, configurable: true, writable: true }); });

const pakaiCrypto = (v: unknown) =>
  Object.defineProperty(globalThis, "crypto", { value: v, configurable: true, writable: true });

describe("newId", () => {
  it("pakai randomUUID kalau tersedia (secure context)", () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/i);
  });

  // Ini kondisi PRODUKSI: http://<IP>:3300 bukan secure context,
  // jadi crypto.randomUUID undefined. Bug nyata 2026-07-21.
  it("tetap jalan saat randomUUID TIDAK ADA (http:// + IP)", () => {
    pakaiCrypto({ getRandomValues: asli.getRandomValues.bind(asli) });
    const id = newId();
    expect(id).toBeTruthy();
    expect(id.length).toBeGreaterThan(8);
  });

  it("tetap jalan saat crypto sama sekali tak ada", () => {
    pakaiCrypto(undefined);
    expect(newId()).toMatch(/^id-/);
  });

  it("menghasilkan id berbeda tiap panggilan (semua jalur)", () => {
    pakaiCrypto({ getRandomValues: asli.getRandomValues.bind(asli) });
    expect(newId()).not.toBe(newId());
    pakaiCrypto(undefined);
    expect(newId()).not.toBe(newId());
  });
});
