"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { POTab } from "@/components/po/POTab"
import { InvoiceClientPage } from "@/components/invoice/InvoiceClientPage"
import { GopayTab } from "@/components/gopay/GopayTab"
import { PageShell } from "@/components/layout/PageShell"
import { SidebarDrawerShell } from "@/components/layout/SidebarDrawerShell"
import { FinanceSidebar, type FinanceTab } from "@/components/finance/FinanceSidebar"

export default function FinancePage() {
  return (
    <Suspense>
      <FinancePageInner />
    </Suspense>
  )
}

const VALID_TABS: FinanceTab[] = ["po", "invoice", "gopay"]

/** Judul PageShell mengikuti tab aktif, supaya selalu menggambarkan yang dilihat. */
const TAB_HEADING: Record<FinanceTab, { title: string; description: string }> = {
  po:      { title: "Purchase Order", description: "Kelola pembelian filament dari vendor" },
  invoice: { title: "Invoice",        description: "Kelola quotation dan invoice untuk buyer" },
  gopay:   { title: "GoPay Login",    description: "Login OTP GoPay/GoBiz Merchant untuk mengaktifkan monitoring transaksi" },
}

function FinancePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get("tab") ?? "po"
  const activeTab: FinanceTab = VALID_TABS.includes(rawTab as FinanceTab)
    ? (rawTab as FinanceTab)
    : "po"

  const [sidebarOpen, setSidebarOpen] = useState(false)

  function setTab(tab: FinanceTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
    setSidebarOpen(false)
  }

  const heading = TAB_HEADING[activeTab]

  return (
    <div className="flex min-h-screen -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <SidebarDrawerShell
        open={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      >
        <FinanceSidebar active={activeTab} onChange={setTab} />
      </SidebarDrawerShell>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <PageShell title={heading.title} description={heading.description}>
          {activeTab === "po" ? <POTab /> : activeTab === "invoice" ? <InvoiceClientPage /> : <GopayTab />}
        </PageShell>
      </div>
    </div>
  )
}
