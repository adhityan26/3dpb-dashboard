import { readFileSync } from 'node:fs'
import {
  Engine, BambuMqttConnector, MoonrakerConnector, MqttReporter,
  TelegramNotifier, PushoverNotifier, type Connector, type Notifier,
} from '@3pb/printer-monitor-core'
import { loadConfig, type AppConfig } from './config'

export function buildFromConfig(config: AppConfig): { engine: Engine; reporter: MqttReporter } {
  const reporter = new MqttReporter({ url: config.broker.url, statusTopic: config.topics.status, eventsTopic: config.topics.events })
  const connectors: Connector[] = config.devices.map((d) =>
    d.connector === 'bambu'
      ? new BambuMqttConnector(d, { pushallIntervalMs: config.pushallIntervalMs })
      : new MoonrakerConnector(d, { pollIntervalMs: config.moonrakerPollMs }))
  const notifiers: Notifier[] = []
  if (config.notifications?.telegram) notifiers.push(new TelegramNotifier(config.notifications.telegram))
  if (config.notifications?.pushover) notifiers.push(new PushoverNotifier(config.notifications.pushover))
  const engine = new Engine({
    devices: config.devices, connectors, reporters: [reporter], notifiers,
    staleAfterMs: config.staleAfterMs, republishIntervalMs: config.republishIntervalMs,
  })
  return { engine, reporter }
}

async function main() {
  const path = process.env.CONFIG_PATH ?? new URL('../config.json', import.meta.url).pathname
  const { config, skipped } = loadConfig(JSON.parse(readFileSync(path, 'utf8')))
  for (const s of skipped) console.warn(`[config] SKIP device ${s.id}: ${s.reason}`)
  console.log(`[printer-monitor] ${config.devices.length} device aktif → ${config.broker.url} topic ${config.topics.status}`)

  const { engine, reporter } = buildFromConfig(config)
  await reporter.connect()
  await engine.start()

  const shutdown = async () => { await engine.stop(); await reporter.close(); process.exit(0) }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) void main()
