import type { QuotationData, SenderInfo } from "@/lib/invoice/types"

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Opens a print dialog for a manual shipping label (resi), sized for A6
 * thermal paper (105mm x 148mm). Builds the HTML directly from data rather
 * than a mounted DOM ref — no printable content needs to be shown on
 * screen first, unlike the full invoice print in InvoiceDetail.
 */
export function printShippingLabel(invoice: QuotationData, sender: SenderInfo): void {
  const win = window.open("", "_blank", "width=420,height=620")
  if (!win) return

  const itemsHtml = invoice.items
    .map((item) => `<div class="item"><span>${esc(item.namaProduk)}</span><span class="qty">x${item.qty}</span></div>`)
    .join("")

  win.document.write(`<html><head><title>Resi ${esc(invoice.nomor)}</title><meta charset="utf-8"/><style>
    @page { size: 105mm 148mm; margin: 5mm; }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,sans-serif;font-size:12px;color:#111}
    .label{display:flex;flex-direction:column;gap:10px;height:100%}
    .sender{text-align:center;padding-bottom:8px;border-bottom:1px dashed #999}
    .sender .nama{font-weight:700;font-size:13px}
    .sender .line{color:#555;margin-top:2px}
    .recipient{display:flex;flex-direction:column;gap:2px}
    .recipient .label-text{color:#888;font-size:10px}
    .recipient .nama{font-weight:700;font-size:14px}
    .recipient .alamat{line-height:1.5;margin-top:2px}
    .recipient .telp{color:#555;margin-top:4px}
    .items{padding-top:8px;border-top:1px dashed #999;display:flex;flex-direction:column;gap:2px}
    .items .label-text{color:#888;font-size:10px;margin-bottom:2px}
    .item{display:flex;justify-content:space-between;gap:8px}
    .item .qty{color:#555;white-space:nowrap}
    .footer{margin-top:auto;padding-top:8px;border-top:1px dashed #999;display:flex;justify-content:space-between;color:#555;font-size:10px}
    @media print{ button,.no-print{display:none!important} }
  </style></head><body>
    <div class="label">
      <div class="sender">
        <div class="nama">${esc(sender.nama)}</div>
        ${sender.alamat ? `<div class="line">${esc(sender.alamat)}</div>` : ""}
        ${sender.telepon ? `<div class="line">${esc(sender.telepon)}</div>` : ""}
      </div>
      <div class="recipient">
        <div class="label-text">Kepada</div>
        <div class="nama">${esc(invoice.buyerNama)}</div>
        <div class="alamat">${esc(invoice.buyerAlamat ?? "")}</div>
        ${invoice.buyerContact ? `<div class="telp">${esc(invoice.buyerContact)}</div>` : ""}
      </div>
      <div class="items">
        <div class="label-text">Isi paket</div>
        ${itemsHtml}
      </div>
      <div class="footer">
        <span>${esc(invoice.nomor)}</span>
        <span>${fmtDate(invoice.tanggal)}</span>
      </div>
    </div>
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 300)
}
