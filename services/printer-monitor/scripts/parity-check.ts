import mqtt from 'mqtt'
import type { PrinterRow, PrintersPayload } from '@3pb/printer-monitor-core'

const url = process.env.BROKER_URL ?? 'mqtt://192.168.88.113:1883'
const A = process.env.TOPIC_A ?? '3dpb/printers'      // n8n
const B = process.env.TOPIC_B ?? '3dpb/printers-v2'   // service

// Field yang dibandingkan strict; last_seen & progress wajar berbeda timing.
const KEYS: (keyof PrinterRow)[] = ['name', 'type', 'state', 'filename']

const got: Record<string, PrintersPayload> = {}
const client = mqtt.connect(url)
client.on('connect', () => client.subscribe([A, B]))
client.on('message', (topic, msg) => {
  const raw = JSON.parse(msg.toString())
  const payload = typeof raw.payload === 'string' ? JSON.parse(raw.payload) : raw.payload // n8n jalur ganymede publish string
  got[topic] = { payload }
  if (got[A] && got[B]) compare()
})

function compare() {
  const byName = (p: PrintersPayload) => new Map(p.payload.map((r) => [r.name, r]))
  const a = byName(got[A]), b = byName(got[B])
  let diffs = 0
  for (const [name, ra] of a) {
    const rb = b.get(name)
    if (!rb) { console.log(`❌ ${name}: tidak ada di ${B}`); diffs++; continue }
    for (const k of KEYS) {
      // state OFFLINE bisa beda timing; hanya bandingkan kalau dua-duanya bukan OFFLINE
      if (k === 'state' && (ra.state === 'OFFLINE' || rb.state === 'OFFLINE')) continue
      if (String(ra[k]) !== String(rb[k])) { console.log(`❌ ${name}.${k}: "${ra[k]}" vs "${rb[k]}"`); diffs++ }
    }
  }
  for (const name of b.keys()) if (!a.has(name)) { console.log(`❌ ${name}: tidak ada di ${A}`); diffs++ }
  console.log(diffs === 0 ? '✅ PARITAS OK' : `⚠️ ${diffs} beda`)
  client.end(); process.exit(diffs === 0 ? 0 : 1)
}

setTimeout(() => { console.error('timeout: retained tidak lengkap di kedua topic'); process.exit(2) }, 15_000)
