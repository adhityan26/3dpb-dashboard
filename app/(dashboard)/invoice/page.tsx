// Server component — DO NOT add "use client" here
// Using next/dynamic with ssr:false to prevent browser-only module (html2canvas) from running on server
import dynamic from "next/dynamic"

const InvoiceClientPage = dynamic(
  () => import("@/components/invoice/InvoiceClientPage").then(m => ({ default: m.InvoiceClientPage })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20" style={{ color: "rgba(255,255,255,0.3)" }}>
        <div className="text-sm">Memuat invoice...</div>
      </div>
    ),
  }
)

export default function InvoicePage() {
  return <InvoiceClientPage />
}
