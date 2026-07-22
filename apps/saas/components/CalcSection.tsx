"use client";
import { useState, type ReactNode } from "react";
import { GlassCard } from "@3pb/ui";
import { rupiah } from "@/lib/kalkulator/format";

export function CalcSection({
  n, title, subtitle, icon, subtotalLabel = "Subtotal", subtotal, summary, defaultOpen = true, children,
}: {
  n: number; title: string; subtitle?: string; icon?: ReactNode;
  subtotalLabel?: string; subtotal?: number; summary?: string;
  defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GlassCard className="p-4 min-w-0">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
        aria-expanded={open}>
        <span className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[12px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--g-accent) 18%, transparent)", color: "var(--g-accent)" }}>
          {icon ?? n}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold g-t1">{n}. {title}</span>
          {subtitle && <span className="block text-[11px] g-t3">{subtitle}</span>}
        </span>
        {typeof subtotal === "number" && (
          <span className="shrink-0 text-right">
            <span className="block text-[10px] g-t4 uppercase tracking-wide">{subtotalLabel}</span>
            <span className="block text-sm font-semibold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(subtotal)}</span>
          </span>
        )}
        <span className="shrink-0 g-t4 text-xs" aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="mt-4">{children}</div>
      ) : (
        summary && <div className="mt-2 text-[12px] g-t3">✓ {summary}</div>
      )}
    </GlassCard>
  );
}
