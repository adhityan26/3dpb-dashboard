import { describe, it, expect } from "vitest";
import { rejectRedirectedOrErrorPlugin } from "./reject-redirected-plugin";

function makeResponse(init: { status?: number; redirected?: boolean }): Response {
  // Response status 0 (opaque cross-origin response) tak bisa dibuat langsung
  // via `new Response()` (DOM/undici menolak, hanya fetch() internal yang bisa
  // menghasilkannya) — jadi construct normal lalu override propertinya, sama
  // seperti `redirected` di bawah.
  const response = new Response(null, { status: 200 });
  if (init.status !== undefined && init.status !== 200) {
    Object.defineProperty(response, "status", { value: init.status });
  }
  if (init.redirected) {
    Object.defineProperty(response, "redirected", { value: true });
  }
  return response;
}

describe("rejectRedirectedOrErrorPlugin", () => {
  it("response normal (200, bukan redirect) → diloloskan (di-cache)", async () => {
    const response = makeResponse({ status: 200 });
    const result = await rejectRedirectedOrErrorPlugin.cacheWillUpdate({ response });
    expect(result).toBe(response);
  });

  it("response opaque (status 0, bukan redirect) → diloloskan (di-cache)", async () => {
    const response = makeResponse({ status: 0 });
    const result = await rejectRedirectedOrErrorPlugin.cacheWillUpdate({ response });
    expect(result).toBe(response);
  });

  it("response redirected → ditolak (null, tak di-cache)", async () => {
    const response = makeResponse({ status: 200, redirected: true });
    const result = await rejectRedirectedOrErrorPlugin.cacheWillUpdate({ response });
    expect(result).toBeNull();
  });

  it("response error 500 (bukan redirect) → ditolak (null, tak di-cache)", async () => {
    const response = makeResponse({ status: 500 });
    const result = await rejectRedirectedOrErrorPlugin.cacheWillUpdate({ response });
    expect(result).toBeNull();
  });

  it("response error 404 (bukan redirect) → ditolak (null, tak di-cache)", async () => {
    const response = makeResponse({ status: 404 });
    const result = await rejectRedirectedOrErrorPlugin.cacheWillUpdate({ response });
    expect(result).toBeNull();
  });
});
