import { fullView, type CalcPlate } from "./compute";
import type { LocalSettings } from "./local-settings";
import type { PlateRow } from "@/components/PlateInput";
import type { KalkulasiInput, KalkulasiSnapshot } from "@/lib/store/kalkulasi-history";

/** Hitung snapshot harga dari KalkulasiInput tersimpan + settings saat ini — dipakai
 *  RiwayatList (tak seperti Calculator, tak punya `view` live yang sudah dihitung). */
export function computeKalkulasiSnapshot(
  input: KalkulasiInput,
  settings: LocalSettings
): KalkulasiSnapshot | null {
  const valid = input.plates.length > 0 && input.plates.every(
    (p) => Number(p.durasiJam) > 0 && p.materials.length > 0 && p.materials.every((m) => Number(m.gramasi) > 0),
  );
  if (!valid) return null;
  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, durasiJam: Number(p.durasiJam),
    materials: p.materials.map((m) => ({ filamentId: m.filamentId, tipe: m.tipe, gramasi: Number(m.gramasi) })),
  });
  const view = fullView({
    plates: input.plates.map(toCalcPlate),
    batch: Number(input.batch),
    komponen: input.komponen,
    labor: input.labor,
    packing: input.packing,
  }, settings);
  return {
    biayaModal: view.biayaModal,
    hargaJualMinimum: view.hargaJualMinimum,
    rekomendasi: view.rekomendasi,
    status: view.status,
    strategi: view.strategi,
  };
}
