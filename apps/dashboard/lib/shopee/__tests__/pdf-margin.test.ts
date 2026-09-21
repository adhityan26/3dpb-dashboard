import { describe, it, expect } from "vitest"
import { PDFDocument, PDFName, degrees, rgb } from "pdf-lib"
import { addPageMargin } from "../pdf-margin"

const MM = 72 / 25.4
const A6_THERMAL: [number, number] = [100 * MM, 150 * MM]

async function makePdf(pages: { size: [number, number]; rotate?: number }[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (const p of pages) {
    const page = doc.addPage(p.size)
    if (p.rotate) page.setRotation(degrees(p.rotate))
    // full-bleed border, like the real label artwork
    page.drawRectangle({ x: 0, y: 0, width: p.size[0], height: p.size[1], borderColor: rgb(0, 0, 0), borderWidth: 4 })
  }
  return Buffer.from(await doc.save())
}

describe("addPageMargin", () => {
  it("keeps page count and each page's size unchanged", async () => {
    const input = await makePdf([{ size: A6_THERMAL }, { size: A6_THERMAL }, { size: [200, 300] }])
    const out = await PDFDocument.load(await addPageMargin(input, 4))
    expect(out.getPageCount()).toBe(3)
    const sizes = out.getPages().map((p) => p.getSize())
    expect(sizes[0].width).toBeCloseTo(A6_THERMAL[0], 1)
    expect(sizes[0].height).toBeCloseTo(A6_THERMAL[1], 1)
    expect(sizes[2]).toEqual({ width: 200, height: 300 })
  })

  it("actually re-frames the content: each output page draws the original as an embedded form, not the raw content", async () => {
    const input = await makePdf([{ size: A6_THERMAL }])
    const output = await addPageMargin(input, 4)
    const out = await PDFDocument.load(output)
    // a drawn embedded page shows up as an XObject in the page resources
    const resources = out.getPage(0).node.Resources()
    expect(resources?.has(PDFName.of("XObject"))).toBe(true)
    expect(output.length).not.toBe(input.length)
  })

  it("returns the input untouched when the margin is 0 or negative", async () => {
    const input = await makePdf([{ size: A6_THERMAL }])
    expect(await addPageMargin(input, 0)).toBe(input)
    expect(await addPageMargin(input, -3)).toBe(input)
  })

  it("copies a rotated page through instead of re-framing it (would flip orientation)", async () => {
    const input = await makePdf([{ size: A6_THERMAL, rotate: 90 }])
    const out = await PDFDocument.load(await addPageMargin(input, 4))
    expect(out.getPageCount()).toBe(1)
    expect(out.getPage(0).getRotation().angle).toBe(90)
  })

  it("copies a page through when the margin would leave no printable area", async () => {
    const input = await makePdf([{ size: [40, 40] }])
    const out = await PDFDocument.load(await addPageMargin(input, 50))
    expect(out.getPageCount()).toBe(1)
    expect(out.getPage(0).getSize()).toEqual({ width: 40, height: 40 })
  })

  it("rejects bytes that are not a PDF, so the caller can fall back to the original", async () => {
    await expect(addPageMargin(Buffer.from("not a pdf"), 4)).rejects.toThrow()
  })
})
