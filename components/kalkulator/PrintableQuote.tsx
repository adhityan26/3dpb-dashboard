"use client"

import { useRef } from "react"
import type { HasilKalkulasi, MarginTier } from "@/lib/kalkulator/types"

interface PlateRow {
  key: string
  namaPart?: string
  tipe: "FDM" | "SLA"
  printer?: string
  gramasi: number
  durasiJam: number
}

interface Props {
  nama: string
  batch: number
  plates: PlateRow[]
  hasil: HasilKalkulasi
  marginTier: MarginTier
  onClose: () => void
}

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

function fmtDurasi(jam: number): string {
  const h = Math.floor(jam)
  const m = Math.round((jam - h) * 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}j` : `${h}j ${m}m`
}

export function PrintableQuote({ nama, batch, plates, hasil, marginTier, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  const shopeePrice = marginTier === "B" ? hasil.shopeeB : marginTier === "C" ? hasil.shopeeC : hasil.shopeeA
  const totalGramasi = plates.reduce((s, p) => s + p.gramasi, 0)
  const totalDurasi = plates.reduce((s, p) => s + p.durasiJam, 0)
  const totalHarga = shopeePrice * batch
  const today = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })

  function handlePrint() {
    if (!printRef.current) return
    const content = printRef.current.innerHTML
    const win = window.open("", "_blank", "width=600,height=800")
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>Quote – ${nama}</title>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px; }
            h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
            .subtitle { font-size: 12px; color: #666; margin-bottom: 24px; }
            .divider { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
            .divider-heavy { border: none; border-top: 2px solid #111; margin: 16px 0; }
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
            td { padding: 7px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; vertical-align: top; }
            td.right, th.right { text-align: right; }
            .total-row td { font-weight: 600; border-top: 2px solid #e5e7eb; border-bottom: none; padding-top: 10px; }
            .summary { display: flex; gap: 24px; margin: 16px 0; }
            .summary-item label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; display: block; }
            .summary-item .val { font-size: 15px; font-weight: 600; margin-top: 2px; }
            .price-box { border: 2px solid #111; border-radius: 8px; padding: 16px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
            .price-box .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; }
            .price-box .price { font-size: 22px; font-weight: 700; }
            .price-box .total { font-size: 14px; color: #555; margin-top: 2px; }
            .footer { margin-top: 28px; font-size: 11px; color: #999; text-align: center; }
            @media print {
              body { padding: 20px; }
              button { display: none !important; }
            }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-[540px] max-h-[85vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{ background: "rgba(14,14,44,0.97)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="px-5 py-3.5 flex items-center justify-between flex-shrink-0"
             style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
            🖨️ Quote untuk Customer
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="h-8 px-4 rounded-[8px] text-xs font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
            >
              Print / Simpan PDF
            </button>
            <button onClick={onClose} className="text-sm w-7 h-7 flex items-center justify-center rounded-full"
                    style={{ color: "rgba(255,255,255,0.4)" }}>✕</button>
          </div>
        </div>

        {/* Preview — white paper style */}
        <div className="flex-1 overflow-y-auto p-5">
          <div ref={printRef} className="bg-white rounded-[12px] p-8" style={{ color: "#111" }}>

            {/* Header */}
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{nama}</h1>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 24 }}>
              Estimasi produksi · {today}
            </div>

            <hr style={{ border: "none", borderTop: "2px solid #111", marginBottom: 16 }} />

            {/* Plates table */}
            {plates.filter(p => p.gramasi > 0).length > 0 && (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Part</th>
                      <th style={{ textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Tipe</th>
                      <th style={{ textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Printer</th>
                      <th style={{ textAlign: "right", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Gramasi</th>
                      <th style={{ textAlign: "right", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plates.filter(p => p.gramasi > 0).map((plate, i) => (
                      <tr key={plate.key}>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, color: plate.namaPart ? "#111" : "#999" }}>
                          {plate.namaPart || "Part " + (i + 1)}
                        </td>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: plate.tipe === "SLA" ? "#ea580c" : "#059669" }}>
                          {plate.tipe}
                        </td>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, color: "#555" }}>
                          {plate.printer?.replace("Bambu Lab ", "").replace("Snapmaker ", "") ?? "—"}
                        </td>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, textAlign: "right" }}>
                          {plate.gramasi.toFixed(1)}g
                        </td>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, textAlign: "right" }}>
                          {fmtDurasi(plate.durasiJam)}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr>
                      <td colSpan={3} style={{ padding: "9px 0 0", fontSize: 12, fontWeight: 600, borderTop: "2px solid #e5e7eb" }}>
                        TOTAL
                      </td>
                      <td style={{ padding: "9px 0 0", fontSize: 12, fontWeight: 700, textAlign: "right", borderTop: "2px solid #e5e7eb" }}>
                        {totalGramasi.toFixed(1)}g
                      </td>
                      <td style={{ padding: "9px 0 0", fontSize: 12, fontWeight: 700, textAlign: "right", borderTop: "2px solid #e5e7eb" }}>
                        {fmtDurasi(totalDurasi)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />

            {/* Summary row */}
            <div style={{ display: "flex", gap: 24, marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666" }}>Batch</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{batch} pcs</div>
              </div>
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666" }}>Total Gramasi</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{(totalGramasi * batch).toFixed(1)}g</div>
              </div>
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666" }}>Total Waktu</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{fmtDurasi(totalDurasi)}/unit</div>
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />

            {/* Price box */}
            <div style={{ border: "2px solid #111", borderRadius: 8, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555" }}>
                  Harga per unit
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmt(shopeePrice)}</div>
              </div>
              {batch > 1 && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555" }}>
                    Total ({batch} pcs)
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{fmt(totalHarga)}</div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, fontSize: 11, color: "#aaa", textAlign: "center" }}>
              Harga adalah estimasi dan dapat berubah. Dibuat dengan 3PB Ops.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
