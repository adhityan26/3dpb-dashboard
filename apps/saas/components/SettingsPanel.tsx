"use client";
import { useEffect, useState } from "react";
import { MARGIN_TIER_LABEL } from "@3pb/kalkulator-core";
import { GlassButton, GlassInput } from "@3pb/ui";
import { DEFAULT_LOCAL_SETTINGS, validateLocalSettings, type LocalSettings, type KomponenPreset } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings, resetSettings } from "@/lib/store/local-settings";
import { getRincianPref, setRincianPref } from "@/lib/store/display-prefs";

function NumField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <label className="text-[11px] g-t3 flex flex-col">
      {label}
      <GlassInput type="number" inputMode="decimal" value={String(value)} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-1" />
    </label>
  );
}

function TxtField({ value, disabled, onChange, ph }: { value: string; disabled: boolean; onChange: (s: string) => void; ph?: string }) {
  return <GlassInput value={value} disabled={disabled} placeholder={ph} onChange={(e) => onChange(e.target.value)} className="w-full" />;
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

function PresetList({ title, disabled, list, onSet, onAdd, onDel, addLabel }: {
  title: string; disabled: boolean; list: KomponenPreset[];
  onSet: (i: number, patch: Partial<KomponenPreset>) => void; onAdd: () => void; onDel: (i: number) => void; addLabel: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12px] font-medium g-t2 flex items-center gap-2">{title} {disabled && <span className="text-[10px] g-t5">🔒 Edit di Beli</span>}</h2>
      {list.map((k, i) => (
        <div key={k.id} className="flex items-center gap-2">
          <GlassInput value={k.nama} disabled={disabled} placeholder="Nama" className="flex-1" onChange={(e) => onSet(i, { nama: e.target.value })} />
          <GlassInput type="number" inputMode="decimal" value={String(k.harga)} disabled={disabled} className="w-28" onChange={(e) => onSet(i, { harga: Number(e.target.value) })} />
          {!disabled && <button type="button" onClick={() => onDel(i)} className="g-t4 text-sm px-1" aria-label={`Hapus ${title}`}>✕</button>}
        </div>
      ))}
      {!disabled && <button type="button" onClick={onAdd} className="text-[12px] g-t4 underline self-start">＋ {addLabel}</button>}
    </section>
  );
}

export function SettingsPanel({ editable, userId }: { editable: boolean; userId: string | null }) {
  const [s, setS] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const disabled = !editable;
  const [rincian, setRincian] = useState(false);

  useEffect(() => { if (editable && userId) loadSettings(userId).then(setS); }, [editable, userId]);
  useEffect(() => { setRincian(getRincianPref()); }, []);

  const toggleRincian = () => { const v = !rincian; setRincian(v); setRincianPref(v); };

  const setMat = (t: "FDM" | "SLA", k: "hppPerGram" | "jualPerGram" | "failureRatePct", n: number) =>
    setS((p) => ({ ...p, material: { ...p.material, [t]: { ...p.material[t], [k]: n } } }));
  const setMargin = (k: "A" | "B" | "C", n: number) => setS((p) => ({ ...p, margin: { ...p.margin, [k]: n } }));
  const setChan = (k: "offline" | "shopee", n: number) => setS((p) => ({ ...p, channels: { ...p.channels, [k]: n } }));

  const mutList = (key: "komponenPresets" | "packingPresets") => ({
    set: (i: number, patch: Partial<KomponenPreset>) => setS((p) => ({ ...p, [key]: p[key].map((k, j) => (j === i ? { ...k, ...patch } : k)) })),
    add: () => setS((p) => ({ ...p, [key]: [...p[key], { id: crypto.randomUUID(), nama: "", harga: 0 }] })),
    del: (i: number) => setS((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) })),
  });
  const komp = mutList("komponenPresets");
  const pack = mutList("packingPresets");

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
      <PresetList title="Komponen tambahan" disabled={disabled} list={s.komponenPresets} onSet={komp.set} onAdd={komp.add} onDel={komp.del} addLabel="Tambah komponen" />
      <PresetList title="Packing" disabled={disabled} list={s.packingPresets} onSet={pack.set} onAdd={pack.add} onDel={pack.del} addLabel="Tambah packing" />
      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-medium g-t2">Tampilan</h2>
        <label className="text-[12px] g-t3 flex items-center gap-2">
          <input type="checkbox" checked={rincian} onChange={toggleRincian} aria-label="Tampilkan rincian perhitungan" />
          Tampilkan rincian perhitungan di kalkulator
        </label>
      </section>

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
