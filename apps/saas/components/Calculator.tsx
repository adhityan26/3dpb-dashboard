"use client";
import { useEffect, useState } from "react";
import { MARGIN_TIER_LABEL, type MarginTier } from "@3pb/kalkulator-core";
import { fullView } from "@/lib/kalkulator/compute";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings } from "@/lib/store/local-settings";
import { GlassCard, GlassInput } from "@3pb/ui";
import { LockedBlock } from "./LockedBlock";
import { AppHeader } from "./AppHeader";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";
import { KomponenLaborInput } from "./KomponenLaborInput";
import { RincianPanel } from "./RincianPanel";
import { getRincianPref } from "@/lib/store/display-prefs";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
const TIERS: MarginTier[] = ["A", "B", "C"];

export function Calculator({ authenticated, paidCore = false, userId = null }: { authenticated: boolean; paidCore?: boolean; userId?: string | null }) {
  const [gramasi, setGramasi] = useState("50");
  const [durasi, setDurasi] = useState("3");
  const [tipe, setTipe] = useState<"FDM" | "SLA">("FDM");
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [komponen, setKomponen] = useState<KomponenRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [packing, setPacking] = useState<{ nama: string; harga: number } | undefined>(undefined);
  const [showRincian, setShowRincian] = useState(false);

  useEffect(() => {
    if (paidCore && userId) {
      loadSettings(userId).then(setSettings);
    }
  }, [paidCore, userId]);

  useEffect(() => {
    setShowRincian(getRincianPref());
  }, []);

  const g = Number(gramasi);
  const d = Number(durasi);
  const valid = Number.isFinite(g) && g > 0 && Number.isFinite(d) && d > 0;
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid ? fullView({ gramasi: g, durasiJam: d, tipe, ...addon }, settings) : null;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <AppHeader subtitle="Kalkulator harga jual" authenticated={authenticated} />
      <div className="grid md:grid-cols-2 gap-5 items-start">
        {/* Input */}
        <GlassCard className="p-4 flex flex-col gap-3">
          <label className="text-[12px] g-t3">Berat (gram)
            <GlassInput type="number" inputMode="decimal" value={gramasi}
              onChange={(e) => setGramasi(e.target.value)} className="w-full mt-1" />
          </label>
          <label className="text-[12px] g-t3">Durasi print (jam)
            <GlassInput type="number" inputMode="decimal" value={durasi}
              onChange={(e) => setDurasi(e.target.value)} className="w-full mt-1" />
          </label>
          <label className="text-[12px] g-t3">Jenis filament
            <select value={tipe} onChange={(e) => setTipe(e.target.value as "FDM" | "SLA")}
              className="glass-input rounded-[10px] px-3 h-10 text-sm w-full mt-1">
              <option value="FDM">FDM (PLA/PETG)</option>
              <option value="SLA">SLA (Resin)</option>
            </select>
          </label>
          <p className="text-[11px] g-t4">Printer: Default (Bambu P1P) · Printer & material custom di Beli 🔒</p>

          <KomponenLaborInput
            locked={!paidCore}
            settings={settings}
            komponen={komponen}
            labor={labor}
            packing={packing}
            onKomponenChange={setKomponen}
            onLaborChange={setLabor}
            onPackingChange={setPacking}
          />
        </GlassCard>

        {/* Hasil */}
        <GlassCard className="p-4">
          {!view ? (
            <p className="text-[12px] g-t4">Isi berat & durasi (angka &gt; 0) untuk lihat hasil.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[12px] g-t4">Biaya modal</div>
                <div className="text-lg font-semibold g-t1">{rupiah(view.biayaModal)}</div>
              </div>
              <div>
                <div className="text-[12px] g-t4">Harga jual minimum</div>
                <div className="text-base g-t2">{rupiah(view.hargaJualMinimum)}</div>
              </div>
              <div>
                <div className="text-[12px] g-t4">Rekomendasi harga jual · margin {MARGIN_TIER_LABEL.B}</div>
                <div className="text-2xl font-bold" style={{ color: "var(--g-accent)" }}>{rupiah(view.rekomendasi)}</div>
              </div>

              <LockedBlock locked={!authenticated}>
                <div className="flex flex-col gap-2 pt-2 border-t border-[color:var(--g-row-border)]">
                  <div className="text-[12px] g-t3 font-medium">Banding margin & channel</div>
                  {view.channels.map((ch) => (
                    <div key={ch.channelId} className="text-[12px] g-t2">
                      <div className="g-t4">{ch.nama}</div>
                      <div className="flex gap-3">
                        {TIERS.map((t) => (
                          <span key={t}>{MARGIN_TIER_LABEL[t]}: {rupiah(ch[t])}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="text-[11px] g-t4">Status: {view.status}</div>
                </div>
              </LockedBlock>

              {showRincian && <RincianPanel rincian={view.rincian} />}

              {!paidCore && (
                <button className="text-[11px] g-t4 text-left underline" onClick={() => { window.location.href = "/beli"; }}>
                  Simpan hasil & multi-plate → Beli 🔒
                </button>
              )}
            </div>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
