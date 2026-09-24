import { InvoiceClientPage } from "@/components/invoice/InvoiceClientPage"
import { PageShell } from "@/components/layout/PageShell"

export default async function InvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>
}) {
  const { open } = await searchParams
  return (
    <PageShell title="Invoice" description="Kelola quotation dan invoice untuk buyer">
      <InvoiceClientPage initialViewId={open ?? null} />
    </PageShell>
  )
}
