import type { NavKey } from "./AppHeader";

type Modul = { key: string; label: string; href?: string; note?: string };

/** Peta modul produk. Yang belum dibangun sengaja TIDAK dilinkkan (badge "segera")
 *  supaya tak ada nav buntu. Tambahkan `href` saat modulnya benar-benar jadi. */
const MODUL: Modul[] = [
  { key: "kalkulator", label: "Kalkulator", href: "/" },
  { key: "invoice", label: "Invoice" },
  { key: "po", label: "PO" },
  { key: "filamen", label: "Filamen" },
  { key: "printer", label: "Printer monitor", note: "add-on" },
];

export function ModulMenu({ current }: { current?: NavKey }) {
  return (
    <details className="relative">
      <summary className="text-[12px] g-t4 hover:g-t2 inline-flex items-center gap-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        Modul <span aria-hidden>▾</span>
      </summary>
      <div className="modal-surface absolute right-0 mt-2 z-20 min-w-[200px] rounded-[10px] p-1 flex flex-col">
        {MODUL.map((m) =>
          m.href ? (
            <a
              key={m.key}
              href={m.href}
              className="text-[12px] g-t2 hover:g-t1 rounded-[8px] px-3 py-2 flex items-center justify-between gap-3 no-underline"
            >
              {m.label}
              {current === m.key && <span aria-label="halaman ini">✓</span>}
            </a>
          ) : (
            <span
              key={m.key}
              aria-disabled="true"
              className="text-[12px] g-t5 rounded-[8px] px-3 py-2 flex items-center justify-between gap-3 cursor-default"
            >
              <span>
                {m.label}
                {m.note && <span className="g-t5"> · {m.note}</span>}
              </span>
              <span className="text-[10px] g-t5 border border-[color:var(--g-row-border)] rounded-[6px] px-1.5 py-0.5">
                segera
              </span>
            </span>
          ),
        )}
      </div>
    </details>
  );
}
