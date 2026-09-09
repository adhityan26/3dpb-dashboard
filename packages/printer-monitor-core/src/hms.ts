import { readFileSync } from 'node:fs'
import type { HmsEntry } from './types'
import hmsCodesJson from './hms-codes.json'

// Named export dari JSON yang sama yang dipakai HmsLookup's loadBundled() secara internal --
// disediakan supaya package lain (agent-core) bisa import data-nya lewat entry point package
// ini, bukan path relatif lintas-package yang rapuh (patah kalau struktur folder berubah).
export const hmsCodes: Record<string, string> = hmsCodesJson as Record<string, string>

const h4 = (n: number) => (n >>> 0).toString(16).padStart(4, '0')

export function hmsKeyFor(e: HmsEntry): string {
  const attr = e.attr >>> 0
  return `${h4(attr >>> 16)}_${h4(attr & 0xffff)}`
}

let bundled: Record<string, string> | null = null
function loadBundled(): Record<string, string> {
  if (!bundled) {
    bundled = JSON.parse(readFileSync(new URL('./hms-codes.json', import.meta.url), 'utf8'))
  }
  return bundled!
}

export class HmsLookup {
  private table: Record<string, string>
  constructor(table?: Record<string, string>) {
    this.table = table ?? loadBundled()
  }
  translate(hms: HmsEntry[]): string[] {
    return hms.map((e) => {
      const key = hmsKeyFor(e)
      const desc = this.table[key] ?? this.table[key.toUpperCase()]
      return desc ? `[${key}] ${desc}` : `hms=code=${e.code}, attr=${e.attr}`
    })
  }
}

// 240 dipilih dari distribusi riil tabel HMS terbundel (2026-08-05, 268 entri
// "[key] desc"): cap 120 motong 50% entri di tengah kalimat; cap 240 motong
// cuma 3% (p95=211, p99=293, max=336). Ini batas SAFETY buffer, bukan target
// muat 1 baris layar -- firmware CYD yang urus wrap/potong visual sesuai
// lebar kartu sebenarnya (sub-project B, belum dikerjakan).
//
// Batas KARAKTER (bukan byte) -- ellipsis '…' 3 byte UTF-8, jadi firmware C
// yang nyimpen string ini ke buffer tetap harus alokasi >=243 byte + NUL,
// bukan cuma 240.
export const MAX_ERROR_MESSAGE_LEN = 240

export function describeError(hms: HmsEntry[], printError: number, lookup: HmsLookup): string {
  const hmsHit = lookup.translate(hms).find((t) => t.startsWith('['))
  // print_error SENDIRI kadang meng-encode kode HMS dgn skema attr yang SAMA (upper16_lower16),
  // TERPISAH dari array hms[] -- kasus nyata (sniff MQTT langsung, 2026-08-09, "AMS filament
  // ran out"): hms[] cuma berisi 1 notice LAIN yang tak terkait alasan pause sebenarnya,
  // sementara print_error=117473297 (0x07008011) persis kunci "0700_8011" di tabel kita
  // (terjemahannya sama persis dgn yang ditampilkan Bambu Connect). Tanpa ini, print_error
  // cuma dipakai sbg ANGKA mentah di fallback di bawah, tak pernah dicoba di-translate.
  const printErrorHit = printError !== 0 ? lookup.translate([{ attr: printError, code: 0 }])[0] : undefined
  const hit = hmsHit ?? (printErrorHit?.startsWith('[') ? printErrorHit : undefined)
  const raw = hit ?? (printError !== 0 ? `Print error (kode ${printError})` : 'Print error')
  return raw.length > MAX_ERROR_MESSAGE_LEN ? raw.slice(0, MAX_ERROR_MESSAGE_LEN - 1) + '…' : raw
}
