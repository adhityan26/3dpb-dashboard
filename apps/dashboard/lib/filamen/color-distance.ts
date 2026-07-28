/** Matematika warna murni — tidak tahu apa-apa soal filament atau katalog.
 *  Spec: docs/superpowers/specs/2026-07-28-bot-api-warna-filamen-design.md §5
 *
 *  CATATAN PENTING: jangan pakai modul ini untuk MENGISI data (mis. menebak nama
 *  warna sebuah filament dari hex-nya). Jarak menjawab "yang mirip apa" untuk
 *  pertanyaan manusia; pengisian field harus pakai kecocokan persis, kalau tidak
 *  sistem akan menuliskan nama warna yang salah dengan penuh percaya diri.
 *  Lihat enrichColor di lib/kalkulator/bot-view.ts. */

export type Rgb = [number, number, number]
export type Lab = [number, number, number]

/** Terima 3/6/8 digit, dengan atau tanpa '#', case bebas. Alpha (8 digit) diabaikan. */
export function parseHex(hex: string | null | undefined): Rgb | null {
  const s = hex?.trim().replace(/^#/, '') ?? ''
  if (!/^[0-9a-fA-F]+$/.test(s)) return null
  const full = s.length === 3 ? s.split('').map(c => c + c).join('')
    : s.length === 6 || s.length === 8 ? s.slice(0, 6)
    : null
  if (!full) return null
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Normalisasi ke enam digit RGB huruf kecil tanpa '#', untuk perbandingan "identik". */
export function normalizeHex(hex: string | null | undefined): string | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  return rgb.map(v => v.toString(16).padStart(2, '0')).join('')
}

/** sRGB 0–255 → linear. Langkah inilah yang paling sering dilupakan; tanpa ini
 *  putih dan hitam tetap benar tapi seluruh mid-tone melenceng. */
function linearize(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

// D65, observer 2°
const WHITE: Rgb = [0.95047, 1.0, 1.08883]

export function rgbToLab(rgb: Rgb): Lab {
  const [r, g, b] = rgb.map(linearize)

  const xyz: Rgb = [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  ]

  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const [fx, fy, fz] = xyz.map((v, i) => f(v / WHITE[i]))

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** CIEDE2000. Diuji terhadap seluruh 34 pasang data referensi Sharma, Wu & Dalal. */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2

  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2

  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2

  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)

  // atan2(0,0) harus 0, bukan NaN — dan hasilnya dinormalisasi ke [0,360).
  const hue = (b: number, ap: number) => {
    if (b === 0 && ap === 0) return 0
    const h = deg(Math.atan2(b, ap))
    return h >= 0 ? h : h + 360
  }
  const h1p = hue(b1, a1p)
  const h2p = hue(b2, a2p)

  const dLp = L2 - L1
  const dCp = C2p - C1p

  let dhp: number
  if (C1p * C2p === 0) dhp = 0
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360
  else dhp = h2p - h1p + 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2)

  const Lbarp = (L1 + L2) / 2
  const Cbarp = (C1p + C2p) / 2

  let hbarp: number
  if (C1p * C2p === 0) hbarp = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2
  else hbarp = (h1p + h2p - 360) / 2

  const T = 1
    - 0.17 * Math.cos(rad(hbarp - 30))
    + 0.24 * Math.cos(rad(2 * hbarp))
    + 0.32 * Math.cos(rad(3 * hbarp + 6))
    - 0.20 * Math.cos(rad(4 * hbarp - 63))

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2))
  const RC = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7))
  const RT = -RC * Math.sin(rad(2 * dTheta))

  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2)
  const SC = 1 + 0.045 * Cbarp
  const SH = 1 + 0.015 * Cbarp * T

  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH),
  )
}

/** Jarak persepsi antara dua string hex. null kalau salah satunya tidak bisa di-parse. */
export function hexDeltaE(a: string | null | undefined, b: string | null | undefined): number | null {
  const rgbA = parseHex(a)
  const rgbB = parseHex(b)
  if (!rgbA || !rgbB) return null
  return deltaE2000(rgbToLab(rgbA), rgbToLab(rgbB))
}
