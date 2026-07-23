"use client";
import Link from "next/link";
import { rupiah } from "@/lib/kalkulator/format";

export function PackingInput({
  locked, presets, packing, onChange,
}: {
  locked: boolean;
  presets: { id: string; nama: string; harga: number }[];
  packing: { nama: string; harga: number } | undefined;
  onChange: (p: { nama: string; harga: number } | undefined) => void;
}) {
  if (locked) {
    return (
      <div>
        <div className="text-[12px] g-t3 font-medium">🔒 Packing</div>
        <p className="text-[11px] g-t4 mt-1">Tambahkan biaya kemasan ke harga jual. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
      </div>
    );
  }
  const Card = ({ active, label, right, onClick }: { active: boolean; label: string; right?: string; onClick: () => void }) => (
    <button type="button" role="radio" aria-checked={active} aria-label={label} onClick={onClick}
      className="flex items-center gap-2.5 rounded-[5px] border p-3 text-left min-w-0"
      style={{ borderColor: active ? "var(--g-accent)" : "var(--g-row-border)", background: active ? "color-mix(in srgb, var(--g-accent) 12%, transparent)" : "transparent" }}>
      <span className="shrink-0 w-4 h-4 rounded-full border grid place-items-center"
        style={{ borderColor: active ? "var(--g-accent)" : "var(--g-row-border)" }}>
        {active && <span className="w-2 h-2 rounded-full" style={{ background: "var(--g-accent)" }} />}
      </span>
      <span className="flex-1 min-w-0 text-[13px] g-t1">{label}</span>
      {right && <span className="shrink-0 text-[12px] g-t2" style={{ fontVariantNumeric: "tabular-nums" }}>{right}</span>}
    </button>
  );
  const isNone = packing == null;
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {presets.map((p) => (
        <Card key={p.id} active={packing?.nama === p.nama && packing?.harga === p.harga}
          label={p.nama} right={rupiah(p.harga)} onClick={() => onChange({ nama: p.nama, harga: p.harga })} />
      ))}
      <Card active={isNone} label="Tanpa packing" onClick={() => onChange(undefined)} />
    </div>
  );
}
