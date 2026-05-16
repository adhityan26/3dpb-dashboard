"use client"

import { useRef, useState } from "react"
import type { HasilKalkulasi, MarginTier } from "@/lib/kalkulator/types"

import type { FilamentEntry } from "@/lib/kalkulator/types"

interface PlateRow {
  key: string
  namaPart?: string
  tipe?: "FDM" | "SLA"
  printer?: string
  gramasi?: number
  materials?: FilamentEntry[]
  durasiJam: number
}

interface Props {
  nama: string
  batch: number
  plates: PlateRow[]
  hasil: HasilKalkulasi
  marginTier: MarginTier
  initialHargaShopee?: number
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

/** Round up to nearest 5000 */
function roundUp5000(n: number): number {
  return Math.ceil(n / 5000) * 5000
}

export function PrintableQuote({ nama, batch, plates, hasil, marginTier, initialHargaShopee, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  const computedOffline = marginTier === "B" ? hasil.offlineB : marginTier === "C" ? hasil.offlineC : hasil.offlineA
  const computedShopee  = marginTier === "B" ? hasil.shopeeB  : marginTier === "C" ? hasil.shopeeC  : hasil.shopeeA

  const [title, setTitle] = useState(nama)
  const [qty, setQty] = useState(batch)
  const [includeOngkir, setIncludeOngkir] = useState(false)
  const [showDetail, setShowDetail] = useState(false)  // default OFF for customer
  const [offlineStr, setOfflineStr] = useState("")
  const [shopeeStr, setShopeeStr] = useState(initialHargaShopee ? String(initialHargaShopee) : "")
  const [buyerName, setBuyerName] = useState("")
  const [buyerContact, setBuyerContact] = useState("")
  const [exportingJpeg, setExportingJpeg] = useState(false)

  const hargaOfflineAktual = parseInt(offlineStr.replace(/\D/g, "")) || 0
  const hargaShopeeAktual  = parseInt(shopeeStr.replace(/\D/g, ""))  || 0

  const effectiveOffline  = hargaOfflineAktual > 0 ? hargaOfflineAktual : roundUp5000(computedOffline)
  const effectiveShopee   = hargaShopeeAktual  > 0 ? hargaShopeeAktual  : roundUp5000(computedShopee)

  // Plates store total-batch values; divide by batch to get per-unit
  const totalGramasiPerUnit = plates.reduce((s, p) => {
    const g = p.materials?.reduce((ms, m) => ms + m.gramasi, 0) ?? (p.gramasi ?? 0)
    return s + g
  }, 0) / Math.max(1, batch)
  const totalDurasiPerUnit  = plates.reduce((s, p) => s + p.durasiJam, 0) / Math.max(1, batch)
  const today = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })

  async function handleExportJpeg() {
    if (!printRef.current) return
    setExportingJpeg(true)
    try {
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      })
      const link = document.createElement("a")
      const safeName = (buyerName || title || nama).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40)
      link.download = `quote-${safeName}.jpg`
      link.href = canvas.toDataURL("image/jpeg", 0.92)
      link.click()
    } finally {
      setExportingJpeg(false)
    }
  }

  function handlePrint() {
    if (!printRef.current) return
    const content = printRef.current.innerHTML
    const win = window.open("", "_blank", "width=620,height=860")
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
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
            th.right, td.right { text-align: right; }
            td { padding: 7px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
            .price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
            .price-box { border: 2px solid #111; border-radius: 8px; padding: 14px; }
            .price-box .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; margin-bottom: 4px; }
            .price-box .val { font-size: 20px; font-weight: 700; }
            .price-box .tot { font-size: 12px; color: #777; margin-top: 3px; }
            .ongkir-note { font-size: 11px; color: #555; margin-top: 8px; padding: 6px 10px; border: 1px solid #e5e7eb; border-radius: 6px; }
            .footer { margin-top: 28px; font-size: 11px; color: #aaa; text-align: center; }
            @media print { body { padding: 20px; } button { display: none !important; } }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  // Controls row label style
  const ctrlLabel = "text-[9px] font-semibold uppercase tracking-wider mb-1"
  const ctrlColor = { color: "rgba(165,180,252,0.6)" }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-[680px] max-h-[90vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{ background: "rgba(14,14,44,0.97)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="px-5 py-3.5 flex items-center justify-between flex-shrink-0"
             style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
            🖨️ Quotation untuk Customer
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJpeg}
              disabled={exportingJpeg}
              className="h-8 px-4 rounded-[8px] text-xs font-semibold transition-all"
              style={{
                background: exportingJpeg ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: exportingJpeg ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)",
              }}
            >
              {exportingJpeg ? "Memproses..." : "📸 Simpan JPEG"}
            </button>
            <button
              onClick={handlePrint}
              className="h-8 px-4 rounded-[8px] text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
            >
              🖨️ Print / PDF
            </button>
            <button onClick={onClose} className="text-sm w-7 h-7 flex items-center justify-center rounded-full"
                    style={{ color: "rgba(255,255,255,0.4)" }}>✕</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* LEFT: Controls */}
          <div className="w-52 flex-shrink-0 px-4 py-5 space-y-4 overflow-y-auto"
               style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}>

            <div>
              <div className={ctrlLabel} style={ctrlColor}>Judul Quote</div>
              <input
                type="text" value={title}
                onChange={e => setTitle(e.target.value)}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
              />
            </div>

            <div>
              <div className={ctrlLabel} style={ctrlColor}>Nama Buyer</div>
              <input
                type="text" value={buyerName}
                onChange={e => setBuyerName(e.target.value)}
                placeholder="Nama pembeli..."
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
              />
            </div>

            <div>
              <div className={ctrlLabel} style={ctrlColor}>No. HP / WA (opsional)</div>
              <input
                type="text" value={buyerContact}
                onChange={e => setBuyerContact(e.target.value)}
                placeholder="08xx..."
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
              />
            </div>

            <div>
              <div className={ctrlLabel} style={ctrlColor}>Qty (untuk quote)</div>
              <input
                type="number" min="1" value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
              />
              <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                Batch kalkulasi: {batch}
              </div>
            </div>

            <div>
              <div className={ctrlLabel} style={ctrlColor}>Harga Offline Aktual</div>
              <input
                type="text" value={offlineStr}
                onChange={e => setOfflineStr(e.target.value)}
                placeholder={`${fmt(roundUp5000(computedOffline))} (auto)`}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
              />
              <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                Kosong = pakai {fmt(roundUp5000(computedOffline))}
              </div>
            </div>

            <div>
              <div className={ctrlLabel} style={ctrlColor}>Harga Marketplace Aktual</div>
              <input
                type="text" value={shopeeStr}
                onChange={e => setShopeeStr(e.target.value)}
                placeholder={`${fmt(roundUp5000(computedShopee))} (auto)`}
                className="glass-input w-full h-9 rounded-[8px] px-3 text-sm"
              />
              <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                Kosong = pakai {fmt(roundUp5000(computedShopee))}
              </div>
            </div>

            <div>
              <div className={ctrlLabel} style={ctrlColor}>Tampilan</div>
              <label className="flex items-center gap-2 cursor-pointer py-2 px-3 rounded-[8px] transition-all"
                     style={{ background: showDetail ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <input type="checkbox" checked={showDetail} onChange={e => setShowDetail(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Tampilkan detail teknis
                </span>
              </label>
              <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                (gramasi, waktu, part list)
              </div>
            </div>

            <div>
              <div className={ctrlLabel} style={ctrlColor}>Ongkir</div>
              <label className="flex items-center gap-2 cursor-pointer py-2 px-3 rounded-[8px] transition-all"
                     style={{ background: includeOngkir ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <input
                  type="checkbox" checked={includeOngkir}
                  onChange={e => setIncludeOngkir(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500"
                />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {includeOngkir ? "Sudah termasuk" : "Belum termasuk"} ongkir
                </span>
              </label>
            </div>

            <div className="text-[10px] pt-2" style={{ color: "rgba(255,255,255,0.2)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
              Untuk save: gunakan Print → Save as PDF dari browser
            </div>
          </div>

          {/* RIGHT: Preview */}
          <div className="flex-1 overflow-y-auto p-5">
            <div ref={printRef} className="bg-white rounded-[12px] p-8" style={{ color: "#111" }}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{title || nama}</h1>
                  <div style={{ fontSize: 12, color: "#666" }}>Estimasi produksi · {today}</div>
                </div>
                {(buyerName || buyerContact) && (
                  <div style={{ textAlign: "right" }}>
                    {buyerName && <div style={{ fontSize: 14, fontWeight: 600 }}>{buyerName}</div>}
                    {buyerContact && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{buyerContact}</div>}
                  </div>
                )}
              </div>

              <hr style={{ border: "none", borderTop: "2px solid #111", marginBottom: 14 }} />

              {/* Parts table + Summary — only when showDetail */}
              {showDetail && plates.filter(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0)).length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
                  <thead>
                    <tr>
                      {["Part", "Tipe", "Gramasi", "Waktu"].map((h, i) => (
                        <th key={h} style={{
                          textAlign: i >= 2 ? "right" : "left",
                          fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em",
                          color: "#666", paddingBottom: 6, borderBottom: "1px solid #e5e7eb"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plates.filter(p => ((p.gramasi ?? 0) > 0 || (p.materials?.length ?? 0) > 0)).map((plate, i) => {
                      // Multi-material: show material list; single: show tipe
                      const totalG = plate.materials?.reduce((s, m) => s + m.gramasi, 0) ?? (plate.gramasi ?? 0)
                      const matLabel = plate.materials && plate.materials.length > 0
                        ? plate.materials.map(m => `${m.brand} ${m.material} ${m.gramasi}g`).join(", ")
                        : plate.tipe ?? "FDM"
                      return (
                      <tr key={plate.key}>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, color: plate.namaPart ? "#111" : "#999" }}>
                          {plate.namaPart || `Part ${i + 1}`}
                        </td>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 11, color: "#555" }}>
                          {matLabel}
                        </td>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, textAlign: "right" }}>
                          {(totalG / Math.max(1, batch)).toFixed(1)}g
                        </td>
                        <td style={{ padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12, textAlign: "right" }}>
                          {fmtDurasi(plate.durasiJam / Math.max(1, batch))}
                        </td>
                      </tr>
                    )})}

                    <tr>
                      <td colSpan={2} style={{ padding: "9px 0 0", fontSize: 12, fontWeight: 700, borderTop: "2px solid #e5e7eb" }}>TOTAL</td>
                      <td style={{ padding: "9px 0 0", fontSize: 12, fontWeight: 700, textAlign: "right", borderTop: "2px solid #e5e7eb" }}>{totalGramasiPerUnit.toFixed(1)}g/unit</td>
                      <td style={{ padding: "9px 0 0", fontSize: 12, fontWeight: 700, textAlign: "right", borderTop: "2px solid #e5e7eb" }}>{fmtDurasi(totalDurasiPerUnit)}/unit</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {showDetail && (
                <>
                  <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "14px 0" }} />
                  <div style={{ display: "flex", gap: 24, marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666" }}>Qty</div>
                      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{qty} pcs</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666" }}>Total Gramasi</div>
                      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{(totalGramasiPerUnit * qty).toFixed(1)}g</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#666" }}>Waktu / unit</div>
                      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{fmtDurasi(totalDurasiPerUnit)}</div>
                    </div>
                  </div>
                </>
              )}

              <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "14px 0" }} />

              {/* Price boxes */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ border: "2px solid #111", borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 4 }}>Harga Offline / unit</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(effectiveOffline)}</div>
                  {qty > 1 && (
                    <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>Total {qty} pcs: {fmt(effectiveOffline * qty)}</div>
                  )}
                </div>
                <div style={{ border: "2px solid #111", borderRadius: 8, padding: 14, background: "#f9fafb" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 4 }}>Harga Marketplace / unit</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(effectiveShopee)}</div>
                  {qty > 1 && (
                    <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>Total {qty} pcs: {fmt(effectiveShopee * qty)}</div>
                  )}
                </div>
              </div>

              {/* Ongkir note */}
              <div style={{ marginTop: 10, fontSize: 11, color: "#555", padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                {includeOngkir ? "✓ Harga sudah termasuk ongkir" : "✗ Harga belum termasuk ongkir"}
              </div>

              <div style={{ marginTop: 20, fontSize: 11, color: "#aaa", textAlign: "center" }}>
                Harga adalah estimasi dan dapat berubah. Dibuat dengan 3PB Ops.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
