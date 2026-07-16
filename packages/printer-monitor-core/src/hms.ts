import { readFileSync } from 'node:fs'
import type { HmsEntry } from './types'

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
