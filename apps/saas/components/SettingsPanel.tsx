"use client";
import { useEffect, useState } from "react";
import { MARGIN_TIER_LABEL } from "@3pb/kalkulator-core";
import { GlassButton, GlassInput } from "@3pb/ui";
import { DEFAULT_LOCAL_SETTINGS, validateLocalSettings, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings, resetSettings } from "@/lib/store/local-settings";

function NumField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <label className="text-[11px] g-t3 flex flex-col">
      {label}
      <GlassInput type="number" inputMode="decimal" value={String(value)} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-1" />
    </label>
  );
}

function Group({ title, locked, children }: { title: string; locked: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12px] font-medium g-t2 flex items-center gap-2">
        {title} {locked && <span className="text-[10px] g-t5">🔒 Edit di Beli</span>}
      </h2>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

export function SettingsPanel({ editable, userId }: { editable: boolean; userId: string | null }) {
  const [s, setS] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const disabled = !editable;

  useEffect(() => { if (editable && userId) loadSettings(userId).then(setS); }, [editable, userId]);

  const setMat = (t: "FDM" | "SLA", k: "hppPerGram" | "jualPerGram" | "failureRatePct", n: number) =>
    setS((p) => ({ ...p, material: { ...p.material, [t]: { ...p.material[t], [k]: n } } }));
  const setMargin = (k: "A" | "B" | "C", n: number) => setS((p) => ({ ...p, margin: { ...p.margin, [k]: n } }));
  const setChan = (k: "offline" | "shopee", n: number) => setS((p) => ({ ...p, channels: { ...p.channels, [k]: n } }));

  async function save() {
    const errs = validateLocalSettings(s);
    if (errs.length) { setMsg(errs[0]); return; }
    if (!userId) return;
    setSaving(true);
    try { await saveSettings(userId, s); setMsg("Tersimpan."); }
    catch { setMsg("Gagal simpan, coba lagi."); }
    setSaving(false);
  }
  async function reset() {
    if (!userId) return;
    await resetSettings(userId);
    setS(DEFAULT_LOCAL_SETTINGS);
    setMsg("Direset ke default.");
  }

  return (
    <div className="flex flex-col gap-5">
      <Group title="Material" locked={disabled}>
        <NumField label="FDM harga modal/g" value={s.material.FDM.hppPerGram} disabled={disabled} onChange={(n) => setMat("FDM", "hppPerGram", n)} />
        <NumField label="FDM harga jual/g" value={s.material.FDM.jualPerGram} disabled={disabled} onChange={(n) => setMat("FDM", "jualPerGram", n)} />
        <NumField label="FDM failure %" value={s.material.FDM.failureRatePct} disabled={disabled} onChange={(n) => setMat("FDM", "failureRatePct", n)} />
        <NumField label="SLA harga modal/g" value={s.material.SLA.hppPerGram} disabled={disabled} onChange={(n) => setMat("SLA", "hppPerGram", n)} />
        <NumField label="SLA harga jual/g" value={s.material.SLA.jualPerGram} disabled={disabled} onChange={(n) => setMat("SLA", "jualPerGram", n)} />
        <NumField label="SLA failure %" value={s.material.SLA.failureRatePct} disabled={disabled} onChange={(n) => setMat("SLA", "failureRatePct", n)} />
      </Group>
      <Group title="Mesin & prototype" locked={disabled}>
        <NumField label="Biaya mesin/jam" value={s.mesinPerJam} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, mesinPerJam: n }))} />
        <NumField label="Failure spread %" value={s.failureSpreadPct} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, failureSpreadPct: n }))} />
        <NumField label="Test layer %" value={s.testLayerPct} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, testLayerPct: n }))} />
      </Group>
      <Group title="Margin & reseller" locked={disabled}>
        <NumField label={`Margin ${MARGIN_TIER_LABEL.A}`} value={s.margin.A} disabled={disabled} onChange={(n) => setMargin("A", n)} />
        <NumField label={`Margin ${MARGIN_TIER_LABEL.B}`} value={s.margin.B} disabled={disabled} onChange={(n) => setMargin("B", n)} />
        <NumField label={`Margin ${MARGIN_TIER_LABEL.C}`} value={s.margin.C} disabled={disabled} onChange={(n) => setMargin("C", n)} />
        <NumField label="Reseller bulk ×" value={s.resellerBulkMultiplier} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, resellerBulkMultiplier: n }))} />
      </Group>
      <Group title="Fee channel" locked={disabled}>
        <NumField label="Offline ×" value={s.channels.offline} disabled={disabled} onChange={(n) => setChan("offline", n)} />
        <NumField label="Shopee ×" value={s.channels.shopee} disabled={disabled} onChange={(n) => setChan("shopee", n)} />
      </Group>

      {editable ? (
        <div className="flex items-center gap-3">
          <GlassButton onClick={save} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</GlassButton>
          <button type="button" onClick={reset} className="text-[12px] g-t4 underline">Reset ke default</button>
          {msg && <span className="text-[12px] g-t4">{msg}</span>}
        </div>
      ) : (
        <a href="/beli" className="g-btn-ghost rounded-[10px] px-4 h-9 inline-flex items-center text-sm self-start">Buka semua ini di Beli →</a>
      )}
    </div>
  );
}
