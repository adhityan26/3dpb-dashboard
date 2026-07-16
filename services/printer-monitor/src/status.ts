import mqtt from 'mqtt'
import type { PrintersPayload } from '@3pb/printer-monitor-core'
import { renderTable } from './render'

const url = process.env.BROKER_URL ?? 'mqtt://192.168.88.113:1883'
const topic = process.env.STATUS_TOPIC ?? '3dpb/printers-v2'

const client = mqtt.connect(url)
client.on('connect', () => {
  client.subscribe(topic)
  console.log(`subscribe ${topic} @ ${url} — menunggu payload retained…`)
})
client.on('message', (_t, msg) => {
  try {
    const p = JSON.parse(msg.toString()) as PrintersPayload
    process.stdout.write('\x1b[2J\x1b[H') // clear
    console.log(`printer-monitor status — ${new Date().toLocaleTimeString('id-ID')}  (${topic})\n`)
    console.log(renderTable(p, Date.now()))
  } catch { /* abaikan frame rusak */ }
})
