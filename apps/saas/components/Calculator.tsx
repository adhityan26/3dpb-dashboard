"use client";
import { useEffect, useState } from "react";
import { MARGIN_TIER_LABEL, type MarginTier } from "@3pb/kalkulator-core";
import { fullView } from "@/lib/kalkulator/compute";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings } from "@/lib/store/local-settings";
import { GlassCard } from "@3pb/ui";
import { LockedBlock } from "./LockedBlock";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";
import { KomponenLaborInput } from "./KomponenLaborInput";
import { PlateInput, type PlateRow } from "./PlateInput";
import type { CalcPlate } from "@/lib/kalkulator/compute";
import { RincianPanel } from "./RincianPanel";
import { getRincianPref } from "@/lib/store/display-prefs";
import { InfoTip } from "./InfoTip";
import Link from "next/link";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
const TIERS: MarginTier[] = ["A", "B", "C"];
// Enum core -> kalimat manusia. TIDAK_DISET = belum ada harga aktual pembanding,
// jadi tak ada yang berguna untuk ditampilkan (kalkulator saas memang belum punya input itu).
const STATUS_LABEL: Record<string, string> = {
  AMAN: "Harga aman — di atas rekomendasi",
  BAWAH_REKM: "Di bawah rekomendasi, masih di atas modal",
  RUGI: "Rugi — di bawah harga jual minimum",
  TIDAK_DISET: "",
};

export function Calculator({ authenticated, paidCore = false, userId = null }: { authenticated: boolean; paidCore?: boolean; userId?: string | null }) {
  const [plates, setPlates] = useState<PlateRow[]>([
    { id: "plate-1", nama: "", tipe: "FDM", gramasi: "50", durasiJam: "3" },
  ]);
  const [batch, setBatch] = useState("1");
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

  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, tipe: p.tipe,
    gramasi: Number(p.gramasi), durasiJam: Number(p.durasiJam),
  });
  const valid =
    plates.length > 0 &&
    plates.every((p) => Number(p.gramasi) > 0 && Number(p.durasiJam) > 0);
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid
    ? fullView({ plates: plates.map(toCalcPlate), batch: paidCore ? Number(batch) : 1, ...addon }, settings)
    : null;

  return (
    <div className="grid md:grid-cols-2 gap-5 items-start">
        {/* Input */}
        <GlassCard className="p-4 flex flex-col gap-3">
          <PlateInput
            locked={!paidCore}
            plates={plates}
            batch={batch}
            onPlatesChange={setPlates}
            onBatchChange={setBatch}
          />
          <p className="text-[11px] g-t4">Printer: Default (Bambu P1P) · Printer & material custom di Pro 🔒</p>

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
                <div className="text-[12px] g-t4 flex items-center gap-1">Biaya modal <InfoTip text="Total yang keluar dari kantongmu: material + mesin + buffer gagal + komponen + labor + packing. Bukan harga jual." /></div>
                <div className="text-lg font-semibold g-t1">{rupiah(view.biayaModal)}</div>
              </div>
              <div>
                <div className="text-[12px] g-t4 flex items-center gap-1">Harga jual minimum <InfoTip text="Batas bawah. Jual di bawah angka ini artinya kamu rugi." /></div>
                <div className="text-base g-t2">{rupiah(view.hargaJualMinimum)}</div>
              </div>
              <div>
                <div className="text-[12px] g-t4 flex items-center gap-1">Rekomendasi harga jual · margin {MARGIN_TIER_LABEL.B} <InfoTip text="Harga jual minimum dikali margin Standard. Ubah pengalinya di Setting → Harga jual." /></div>
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
                  {STATUS_LABEL[view.status] && (
                    <div className="text-[11px] g-t4">{STATUS_LABEL[view.status]}</div>
                  )}
                </div>
              </LockedBlock>

              {showRincian && <RincianPanel rincian={view.rincian} />}

              {!paidCore && (
                <Link href="/beli" className="text-[11px] g-t4 text-left underline">
                  Simpan hasil → Pro 🔒
                </Link>
              )}
            </div>
          )}
        </GlassCard>
    </div>
  );
}
