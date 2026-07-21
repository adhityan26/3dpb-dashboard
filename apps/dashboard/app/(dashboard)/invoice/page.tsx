import { InvoiceClientPage } from "@/components/invoice/InvoiceClientPage"
import { PageShell } from "@/components/layout/PageShell"

export default function InvoicePage() {
  return (
    <PageShell title="Invoice" description="Kelola quotation dan invoice untuk buyer">
      <InvoiceClientPage />
    </PageShell>
  )
}
