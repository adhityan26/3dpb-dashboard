"use client";
import { useState } from "react";

/** Penjelasan singkat "ini gunanya apa / pengaruhnya ke mana".
 *  Dibuka lewat klik/tap MAUPUN hover — klik dipakai supaya bisa dibuka di HP,
 *  karena tooltip hover-only tak bisa disentuh. */
export function InfoTip({ text, label = "Penjelasan" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="w-[14px] h-[14px] rounded-full text-[9px] leading-none flex items-center justify-center g-t5 border border-[color:var(--g-row-border)]"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="modal-surface absolute left-1/2 -translate-x-1/2 top-[18px] z-30 w-[210px] rounded-[8px] p-2 text-[11px] g-t2 font-normal normal-case"
        >
          {text}
        </span>
      )}
    </span>
  );
}
