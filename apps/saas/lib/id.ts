/**
 * ID unik untuk baris/preset di klien.
 *
 * JANGAN pakai `crypto.randomUUID()` langsung di kode klien: fungsi itu HANYA ada
 * di secure context (HTTPS atau http://localhost). App ini dilayani lewat
 * `http://192.168.88.113:3300` — IP + HTTP biasa = BUKAN secure context — sehingga
 * `crypto.randomUUID` undefined dan pemanggilannya melempar TypeError di dalam
 * event handler React, membuat tombol "tak melakukan apa-apa" tanpa pesan error.
 *
 * Test tidak menangkap ini karena Node selalu menyediakan `crypto.randomUUID`
 * tanpa peduli secure context.
 */
export function newId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
