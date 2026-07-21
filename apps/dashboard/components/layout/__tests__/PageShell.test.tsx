import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PageShell } from "../PageShell"

/**
 * Kontrak kerangka halaman dashboard. Yang dijaga di sini:
 * judul selalu terender sebagai H1, `description`/`actions` opsional, dan
 * shell TIDAK ikut merender `<main>`/nav/background (itu tugas layout).
 */
describe("PageShell", () => {
  it("merender title sebagai H1", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Analisa">
        <p>isi</p>
      </PageShell>,
    )
    expect(html).toMatch(/<h1[^>]*>Analisa<\/h1>/)
  })

  it("merender children", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Order">
        <p>daftar pesanan</p>
      </PageShell>,
    )
    expect(html).toContain("<p>daftar pesanan</p>")
  })

  it("menampilkan description saat diisi", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Iklan" description="Performa iklan Shopee hari ini">
        <p>isi</p>
      </PageShell>,
    )
    expect(html).toContain("Performa iklan Shopee hari ini")
  })

  it("tidak merender paragraf description saat tidak diisi", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Iklan">
        <span>isi</span>
      </PageShell>,
    )
    expect(html).not.toContain("<p")
  })

  it("menampilkan actions saat diisi", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Invoice" actions={<button>Buat Invoice</button>}>
        <p>isi</p>
      </PageShell>,
    )
    expect(html).toContain("<button>Buat Invoice</button>")
  })

  it("tidak merender wadah actions saat tidak diisi", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Invoice">
        <p>isi</p>
      </PageShell>,
    )
    expect(html).not.toContain("flex-shrink-0")
  })

  it("tidak merender main/nav/background — itu tugas layout", () => {
    const html = renderToStaticMarkup(
      <PageShell title="Settings">
        <p>isi</p>
      </PageShell>,
    )
    expect(html).not.toContain("<main")
    expect(html).not.toContain("<nav")
    expect(html).not.toContain("bg-glass-page")
  })
})
