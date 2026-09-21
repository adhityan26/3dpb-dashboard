import { PDFDocument } from "pdf-lib"

const PT_PER_MM = 72 / 25.4

/**
 * Shopee's THERMAL_AIR_WAYBILL PDF is full-bleed: label artwork runs right up
 * to the page edge, so the printer's own unprintable band clips it (barcode
 * and address lines get cut off) no matter how the browser dialog is set.
 * Re-frame every page onto a canvas of the SAME size with the original page
 * scaled down uniformly and centered, leaving `marginMm` of blank paper on
 * every side. Page count/order and page size are unchanged, so the output
 * prints exactly like the original would on the same paper.
 *
 * Pages carrying a /Rotate flag are copied through untouched: embedPdf()
 * draws the unrotated MediaBox, so re-framing them would flip orientation.
 */
export async function addPageMargin(pdf: Buffer, marginMm: number): Promise<Buffer> {
  if (!(marginMm > 0)) return pdf

  const src = await PDFDocument.load(pdf)
  const out = await PDFDocument.create()
  const marginPt = marginMm * PT_PER_MM

  for (let i = 0; i < src.getPageCount(); i++) {
    const srcPage = src.getPage(i)
    const { width, height } = srcPage.getSize()

    if (srcPage.getRotation().angle !== 0) {
      const [copied] = await out.copyPages(src, [i])
      out.addPage(copied)
      continue
    }

    const innerW = width - 2 * marginPt
    const innerH = height - 2 * marginPt
    if (!(innerW > 0) || !(innerH > 0)) {
      const [copied] = await out.copyPages(src, [i])
      out.addPage(copied)
      continue
    }

    const scale = Math.min(innerW / width, innerH / height)
    const drawW = width * scale
    const drawH = height * scale
    const embedded = await out.embedPage(srcPage)
    const page = out.addPage([width, height])
    page.drawPage(embedded, {
      x: (width - drawW) / 2,
      y: (height - drawH) / 2,
      width: drawW,
      height: drawH,
    })
  }

  return Buffer.from(await out.save())
}
