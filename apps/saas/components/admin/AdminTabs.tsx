"use client";
import { useState, type ReactNode } from "react";

export type AdminTab = { key: string; label: string; node: ReactNode };

export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 flex-wrap border-b border-[color:var(--g-row-border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`px-3 py-2 text-[13px] -mb-px border-b-2 ${active === t.key ? "g-t1 font-medium" : "g-t4 border-transparent"}`}
            style={active === t.key ? { borderColor: "var(--g-accent)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{current?.node}</div>
    </div>
  );
}
