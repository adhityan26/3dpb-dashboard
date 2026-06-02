"use client"

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { POTab } from "@/components/po/POTab"
import { InvoiceClientPage } from "@/components/invoice/InvoiceClientPage"

export default function FinancePage() {
  return (
    <Suspense>
      <FinancePageInner />
    </Suspense>
  )
}

const VALID_TABS = ["po", "invoice"] as const
type FinanceTab = typeof VALID_TABS[number]

function FinancePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get("tab") ?? "po"
  const activeTab: FinanceTab = (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as FinanceTab)
    : "po"

  function setTab(tab: FinanceTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab nav */}
      <div className="flex border-b border-gray-200 dark:border-white/10 flex-wrap">
        {([
          ["po",      "📋 PO"],
          ["invoice", "📄 Invoice"],
        ] as [FinanceTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? "border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "po" ? <POTab /> : <InvoiceClientPage />}
    </div>
  )
}
