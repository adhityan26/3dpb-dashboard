"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { MARGIN_TIER_LABEL } from "@3pb/kalkulator-core";
import { GlassButton, GlassInput } from "@3pb/ui";
import { DEFAULT_LOCAL_SETTINGS, validateLocalSettings, type LocalSettings, type KomponenPreset, type LaborItemInput } from "@/lib/kalkulator/local-settings";
import { loadSettings, saveSettings, resetSettings } from "@/lib/store/local-settings";
import { getRincianPref, setRincianPref } from "@/lib/store/display-prefs";
import { InfoTip } from "./InfoTip";
import { newId } from "@/lib/id";

function NumField({ label, hint, value, disabled, onChange }: { label: string; hint?: string; value: number; disabled: boolean; onChange: (n: number) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <span className="text-[11px] g-t3 flex items-center gap-1">
        <label htmlFor={id}>{label}</label>
        {hint && <InfoTip text={hint} />}
      </span>
      <GlassInput id={id} type="number" inputMode="decimal" value={String(value)} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-1" />
    </div>
  );
}

/** Section besar: judul + kalimat tujuan + pemisah, supaya arah halaman jelas. */
function Section({ title, purpose, locked, children }: { title: string; purpose: string; locked?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 pt-5 border-t border-[color:var(--g-row-border)] first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-[13px] font-medium g-t1 flex items-center gap-2">
          {title}
          {locked && <span className="text-[10px] g-t5 font-normal">🔒 Edit di Pro</span>}
        </h2>
        <p className="text-[11px] g-t4 mt-[2px]">{purpose}</p>
      </div>
      {children}
    </section>
  );
}

function PresetList({ title, hint, disabled, list, onSet, onAdd, onDel, addLabel }: {
  title: string; hint: string; disabled: boolean; list: KomponenPreset[];
  onSet: (i: number, patch: Partial<KomponenPreset>) => void; onAdd: () => void; onDel: (i: number) => void; addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[12px] g-t2 flex items-center gap-1">{title} <InfoTip text={hint} /></h3>
      {list.map((k, i) => (
        <div key={k.id} className="flex items-center gap-2">
          <GlassInput value={k.nama} disabled={disabled} placeholder="Nama" className="flex-1" onChange={(e) => onSet(i, { nama: e.target.value })} />
          <GlassInput type="number" inputMode="decimal" value={String(k.harga)} disabled={disabled} className="w-28" onChange={(e) => onSet(i, { harga: Number(e.target.value) })} />
          {!disabled && <button type="button" onClick={() => onDel(i)} className="g-t4 text-sm px-1" aria-label={`Hapus ${title}`}>✕</button>}
        </div>
      ))}
      {!disabled && <button type="button" onClick={onAdd} className="text-[12px] g-t4 underline self-start">＋ {addLabel}</button>}
    </div>
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
    add: () => setS((p) => ({ ...p, [key]: [...p[key], { id: newId(), nama: "", harga: 0 }] })),
    del: (i: number) => setS((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) })),
  });
  const komp = mutList("komponenPresets");
  const pack = mutList("packingPresets");

  const setLaborNama = (i: number, nama: string) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === i ? { ...l, nama } : l)) }));
  const addLaborPreset = () =>
    setS((p) => ({ ...p, laborPresets: [...p.laborPresets, { id: newId(), nama: "", items: [{ nama: "", flat: 0 }] }] }));
  const delLaborPreset = (i: number) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.filter((_, j) => j !== i) }));
  const setItem = (pi: number, ii: number, patch: Partial<LaborItemInput>) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === pi ? { ...l, items: l.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) } : l)) }));
  const addItem = (pi: number) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === pi ? { ...l, items: [...l.items, { nama: "Item", jam: 1, ratePerJam: 35000 }] } : l)) }));
  const delItem = (pi: number, ii: number) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === pi ? { ...l, items: l.items.filter((_, k) => k !== ii) } : l)) }));
  const numOrUndef = (v: string) => (v === "" ? undefined : Number(v));

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
      {/* 1 — apa yang keluar dari kantong */}
      <Section title="Biaya produksi" purpose="Berapa modal yang keluar tiap produk. Semua di sini menaikkan Biaya modal." locked={disabled}>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="FDM harga modal/g" hint="Harga beli filament FDM per gram. Dikali berat produk untuk jadi Biaya modal." value={s.material.FDM.hppPerGram} disabled={disabled} onChange={(n) => setMat("FDM", "hppPerGram", n)} />
          <NumField label="SLA harga modal/g" hint="Harga beli resin per gram. Dipakai kalau jenis filament SLA." value={s.material.SLA.hppPerGram} disabled={disabled} onChange={(n) => setMat("SLA", "hppPerGram", n)} />
          <NumField label="FDM failure %" hint="Perkiraan persen cetakan FDM gagal. Menambah buffer gagal ke Biaya modal." value={s.material.FDM.failureRatePct} disabled={disabled} onChange={(n) => setMat("FDM", "failureRatePct", n)} />
          <NumField label="SLA failure %" hint="Perkiraan persen cetakan SLA gagal. Menambah buffer gagal ke Biaya modal." value={s.material.SLA.failureRatePct} disabled={disabled} onChange={(n) => setMat("SLA", "failureRatePct", n)} />
          <NumField label="Biaya mesin/jam" hint="Listrik + depresiasi printer + maintenance per jam. Dikali durasi print." value={s.mesinPerJam} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, mesinPerJam: n }))} />
          <NumField label="Failure spread %" hint="Berapa persen biaya gagal dibebankan ke produk ini. 50 = separuhnya, sisanya dianggap tertutup produksi lain." value={s.failureSpreadPct} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, failureSpreadPct: n }))} />
          <NumField label="Test layer %" hint="Biaya uji layer/prototype yang dibebankan ke produk." value={s.testLayerPct} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, testLayerPct: n }))} />
        </div>
      </Section>

      {/* 2 — dari modal jadi harga */}
      <Section title="Harga jual" purpose="Dari modal, jadi berapa harga jualnya." locked={disabled}>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="FDM harga jual/g" hint="Tarif jual filament FDM per gram. Menentukan Harga jual minimum (bukan Biaya modal)." value={s.material.FDM.jualPerGram} disabled={disabled} onChange={(n) => setMat("FDM", "jualPerGram", n)} />
          <NumField label="SLA harga jual/g" hint="Tarif jual resin per gram. Menentukan Harga jual minimum." value={s.material.SLA.jualPerGram} disabled={disabled} onChange={(n) => setMat("SLA", "jualPerGram", n)} />
          <NumField label={`Margin ${MARGIN_TIER_LABEL.A}`} hint="Pengali dari Harga jual minimum untuk tier termurah. 1,1 = jual 1,1× harga minimum." value={s.margin.A} disabled={disabled} onChange={(n) => setMargin("A", n)} />
          <NumField label={`Margin ${MARGIN_TIER_LABEL.B}`} hint="Pengali tier tengah — ini yang dipakai sebagai Rekomendasi harga jual." value={s.margin.B} disabled={disabled} onChange={(n) => setMargin("B", n)} />
          <NumField label={`Margin ${MARGIN_TIER_LABEL.C}`} hint="Pengali tier tertinggi, untuk produk yang bisa dijual premium." value={s.margin.C} disabled={disabled} onChange={(n) => setMargin("C", n)} />
          <NumField label="Reseller bulk ×" hint="Pengali harga khusus reseller yang beli banyak. Di bawah margin normal." value={s.resellerBulkMultiplier} disabled={disabled} onChange={(n) => setS((p) => ({ ...p, resellerBulkMultiplier: n }))} />
          <NumField label="Fee Offline ×" hint="Pengali channel offline. 1,0 = tanpa potongan." value={s.channels.offline} disabled={disabled} onChange={(n) => setChan("offline", n)} />
          <NumField label="Fee Shopee ×" hint="Pengali untuk menutup potongan Shopee. 1,2 = naikkan harga 20%." value={s.channels.shopee} disabled={disabled} onChange={(n) => setChan("shopee", n)} />
        </div>
      </Section>

      {/* 3 — biaya di luar cetak */}
      <Section title="Tambahan" purpose="Biaya di luar proses cetak. Muncul sebagai pilihan cepat di kalkulator." locked={disabled}>
        <PresetList title="Komponen" hint="Preset komponen (gantungan, switch, label). Di kalkulator tinggal klik — bisa dipilih lebih dari satu." disabled={disabled} list={s.komponenPresets} onSet={komp.set} onAdd={komp.add} onDel={komp.del} addLabel="Tambah komponen" />
        <PresetList title="Packing" hint="Pilihan packing. Di kalkulator hanya SATU yang bisa dipilih per perhitungan." disabled={disabled} list={s.packingPresets} onSet={pack.set} onAdd={pack.add} onDel={pack.del} addLabel="Tambah packing" />

        <div className="flex flex-col gap-3">
          <h3 className="text-[12px] g-t2 flex items-center gap-1">
            Labor (preset bundle)
            <InfoTip text="Paket biaya tenaga kerja. Satu klik di kalkulator mengisi beberapa baris sekaligus. Biaya = jam × rate + flat." />
          </h3>
          {s.laborPresets.map((lp, pi) => (
            <div key={lp.id} className="flex flex-col gap-1 border-l-2 border-[color:var(--g-row-border)] pl-2">
              <div className="flex items-center gap-2">
                <GlassInput value={lp.nama} disabled={disabled} placeholder="Nama preset" className="flex-1" onChange={(e) => setLaborNama(pi, e.target.value)} />
                {!disabled && <button type="button" onClick={() => delLaborPreset(pi)} className="g-t4 text-sm px-1" aria-label="Hapus preset labor">✕ preset</button>}
              </div>
              {lp.items.map((it, ii) => (
                <div key={ii} className="flex items-center gap-2 flex-wrap pl-2">
                  <GlassInput value={it.nama} disabled={disabled} placeholder="Item" className="flex-1 min-w-[100px]" onChange={(e) => setItem(pi, ii, { nama: e.target.value })} />
                  <GlassInput type="number" inputMode="decimal" placeholder="jam" value={it.jam ?? ""} disabled={disabled} className="w-16" onChange={(e) => setItem(pi, ii, { jam: numOrUndef(e.target.value) })} />
                  <GlassInput type="number" inputMode="decimal" placeholder="rate/jam" value={it.ratePerJam ?? ""} disabled={disabled} className="w-24" onChange={(e) => setItem(pi, ii, { ratePerJam: numOrUndef(e.target.value) })} />
                  <GlassInput type="number" inputMode="decimal" placeholder="flat" value={it.flat ?? ""} disabled={disabled} className="w-20" onChange={(e) => setItem(pi, ii, { flat: numOrUndef(e.target.value) })} />
                  {!disabled && <button type="button" onClick={() => delItem(pi, ii)} className="g-t4 text-sm px-1" aria-label="Hapus item">✕</button>}
                </div>
              ))}
              {!disabled && <button type="button" onClick={() => addItem(pi)} className="text-[11px] g-t4 underline self-start pl-2">＋ Tambah item</button>}
            </div>
          ))}
          {!disabled && <button type="button" onClick={addLaborPreset} className="text-[12px] g-t4 underline self-start">＋ Tambah preset labor</button>}
        </div>
      </Section>

      {/* 4 — tampilan; selalu bisa diubah, bukan fitur berbayar */}
      <Section title="Tampilan" purpose="Cara hasil ditampilkan. Bisa diubah semua pengguna.">
        <label className="text-[12px] g-t3 flex items-center gap-2">
          <input type="checkbox" checked={rincian} onChange={toggleRincian} aria-label="Tampilkan rincian perhitungan" />
          Tampilkan rincian perhitungan di kalkulator
          <InfoTip text="Menampilkan asal-usul angka: produksi, komponen, packing, labor → Biaya modal → harga. Tak mengubah hasil hitungan." />
        </label>
      </Section>

      {editable ? (
        <div className="flex items-center gap-3 pt-4 border-t border-[color:var(--g-row-border)]">
          <GlassButton onClick={save} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</GlassButton>
          <button type="button" onClick={reset} className="text-[12px] g-t4 underline">Reset ke default</button>
          {msg && <span className="text-[12px] g-t4">{msg}</span>}
        </div>
      ) : (
        <Link href="/beli" className="g-btn-ghost rounded-[10px] px-4 h-9 inline-flex items-center text-sm self-start">Buka semua ini di Pro →</Link>
      )}
    </div>
  );
}
