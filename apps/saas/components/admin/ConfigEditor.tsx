"use client";
import { useState } from "react";
import { GlassButton, GlassInput } from "@3pb/ui";

const LABELS: Record<string, string> = {
  "price.beli": "Harga Beli (Rp)",
  "price.discountBuffer": "Buffer diskon kode unik (Rp, min 1000)",
  "qris.static": "QRIS statik merchant — paste teks payload (00020101…)",
  "copy.refund": "Teks kebijakan refund",
  "copy.hero.headline": "Headline hero (landing)",
  "feature.pos.status": "Status fitur POS",
  "price.sub.owner": "Harga Subscribe pembeli (nanti)",
  "price.sub.standalone": "Harga Subscribe standalone (nanti)",
};
const labelOf = (k: string) => LABELS[k] ?? k;

export function ConfigEditor({ initial }: { initial: Record<string, string> }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    setMsg(res.ok ? "Tersimpan." : "Gagal menyimpan.");
  }

  return (
    <div className="flex flex-col gap-2">
      {Object.keys(values).sort().map((key) => (
        <label key={key} className="text-[12px] g-t3 flex flex-col">
          <span className="font-medium g-t2">{labelOf(key)}</span>
          <span className="text-[10px] g-t5">{key}</span>
          <GlassInput value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} className="w-full mt-1" />
        </label>
      ))}
      <div className="flex items-center gap-3 mt-1">
        <GlassButton onClick={save} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</GlassButton>
        {msg && <span className="text-[12px] g-t4">{msg}</span>}
      </div>
    </div>
  );
}
