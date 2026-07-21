import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

/**
 * TypeScript menjamin `title` terisi KALAU halaman pakai PageShell — tapi tak
 * bisa memaksa halaman memakainya. Test ini menutup celah itu: halaman baru di
 * `app/(dashboard)` wajib lewat PageShell, supaya tak ada lagi halaman tanpa
 * judul. Pedoman: `docs/ui-page-layout.md` §5.
 */
const PAGES_DIR = path.resolve(__dirname, "../../../app/(dashboard)")

function dashboardPages(): string[] {
  return readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(PAGES_DIR, e.name, "page.tsx"))
    .filter((p) => {
      try {
        readFileSync(p)
        return true
      } catch {
        return false // folder route tanpa page.tsx (mis. hanya punya API/segment lain)
      }
    })
}

describe("cakupan PageShell di app/(dashboard)", () => {
  const pages = dashboardPages()

  it("menemukan halaman untuk diperiksa", () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  it.each(pages.map((p) => [path.relative(PAGES_DIR, p), p]))(
    "%s dibungkus PageShell",
    (_label, file) => {
      expect(readFileSync(file, "utf8")).toContain("PageShell")
    },
  )

  it.each(pages.map((p) => [path.relative(PAGES_DIR, p), p]))(
    "%s tidak merender GlassPageHeader langsung (lewat PageShell saja)",
    (_label, file) => {
      expect(readFileSync(file, "utf8")).not.toContain("GlassPageHeader")
    },
  )

  it.each(pages.map((p) => [path.relative(PAGES_DIR, p), p]))(
    "%s tidak menulis <main>/nav/background sendiri — itu tugas layout",
    (_label, file) => {
      const src = readFileSync(file, "utf8")
      expect(src).not.toContain("<main")
      expect(src).not.toContain("bg-glass-page")
      expect(src).not.toContain("<TabNav")
      expect(src).not.toContain("<AmbientOrbs")
    },
  )
})
