"use client";
import { useEffect, useState, type ReactNode } from "react";

export type AdminTab = { key: string; label: string; node: ReactNode };

/** Tab admin. Sinkron dengan hash URL (mis. `#pembayaran`) supaya bisa dilink antar-tab. */
export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && tabs.some((t) => t.key === h)) setActive(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // tabs identitasnya stabil per render halaman admin
  }, [tabs]);

  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  function pick(key: string) {
    setActive(key);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${key}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 flex-wrap border-b border-[color:var(--g-row-border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => pick(t.key)}
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
