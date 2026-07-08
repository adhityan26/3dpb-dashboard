"use client"

import { useState } from "react"
import { SpoolTab } from "./SpoolTab"
import { AmsTab } from "./AmsTab"
import { PrinterTab } from "./PrinterTab"

type FilamenSubTab = "spool" | "ams" | "printer"

const TABS: { key: FilamenSubTab; label: string }[] = [
  { key: "spool", label: "Spool" },
  { key: "ams", label: "Urutan AMS" },
  { key: "printer", label: "Printer" },
]

export function FilamenTab() {
  const [active, setActive] = useState<FilamenSubTab>("spool")

  return (
    <div>
      <div className="flex border-b border-gray-200 dark:border-slate-700 mb-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === key
                ? "border-[#EE4D2D] dark:border-indigo-400 text-[#EE4D2D] dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {active === "spool" && <SpoolTab />}
      {active === "ams" && <AmsTab />}
      {active === "printer" && <PrinterTab />}
    </div>
  )
}
