import type JSZip from "jszip";

// Cari file thumbnail plate di dalam zip .gcode.3mf. Coba plate_1.png dulu (paling umum),
// lalu plate_1_small.png (varian lebih kecil yang selalu ada bareng plate_1.png di file 3mf
// asli -- lihat riset vault bambu-3mf-gcode-metadata), lalu fallback ke plate_N.png pertama
// yang ketemu (urutan angka) kalau plate_1 tak ada sama sekali (kasus file project yang
// plate pertamanya sudah dihapus user di slicer).
export function findPlateThumbnail(zip: JSZip): JSZip.JSZipObject | null {
  return (
    zip.file("Metadata/plate_1.png") ??
    zip.file("Metadata/plate_1_small.png") ??
    (() => {
      const names = Object.keys(zip.files ?? {})
        .filter((n) => /^Metadata\/plate_\d+\.png$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
      return names.length > 0 ? zip.file(names[0]) : null;
    })()
  );
}

// Ekstrak thumbnail base64 yang di-embed slicer di header komentar file .gcode POLOS
// (bukan .gcode.3mf) -- format "; thumbnail begin WxH size" ... "; thumbnail end", satu
// baris base64 per baris komentar. **ASUMSI SEMENTARA, BELUM DIVERIFIKASI** -- ini konvensi
// umum PrusaSlicer/OrcaSlicer (basis slicer Bambu Studio), tapi belum dikonfirmasi terhadap
// file .gcode Bambu asli. Kalau formatnya beda, fungsi ini cuma balikin null (placeholder
// tampil, bukan crash) -- verifikasi manual terhadap file .gcode nyata dari printer Bambu
// wajib sebelum fitur ini dianggap final untuk kasus plain-gcode.
export function extractGcodeThumbnail(text: string): string | null {
  const match = text.match(/;\s*thumbnail begin[^\n]*\n([\s\S]*?)\n;\s*thumbnail end/i);
  if (!match) return null;
  const base64 = match[1]
    .split("\n")
    .map((line) => line.replace(/^;\s?/, "").trim())
    .join("");
  if (!base64) return null;
  return `data:image/png;base64,${base64}`;
}
