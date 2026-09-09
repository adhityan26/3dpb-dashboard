import { app, BrowserWindow } from 'electron'
import { createWindow, disableApplicationMenu } from './window'
import { createTray } from './tray'
import { attachHideOnClose } from './window-lifecycle'
import { startBroker } from './broker'
import { buildPairedDevices, ensureBrokerPin, loadCredentials, fetchLatestVersion, listLocalIpCandidates, loadOrCreateConfig } from '@3pb/agent-core'
import { startEngine } from '@3pb/agent-core'
import { publishLayout } from '@3pb/agent-core'
import { registerIpcHandlers } from './ipc'
import { setEngine, setBrokerPort, setBrokerPin, setReporters, setUpdateAvailable, setCredentialStoreDegraded } from './app-state'
import { SafeStorageCredentialStore, ElectronPathProvider, ElectronLogAdapter, getElectronBuildInfo } from './platform-electron'
import log from 'electron-log/main'

const gotLock = app.requestSingleInstanceLock()
const credentialStore = new SafeStorageCredentialStore()
const pathProvider = new ElectronPathProvider()
const logger = new ElectronLogAdapter()
const buildInfo = getElectronBuildInfo()

let mainWindow: BrowserWindow | null = null
// App ini dirancang jalan terus di background (broker MQTT + monitoring printer harus tetap
// hidup walau window ditutup) -- isQuitting cuma jadi true lewat "Keluar" di tray atau
// before-quit (Cmd+Q dkk di mac), TIDAK PERNAH lewat menutup window biasa.
let isQuitting = false

/**
 * Urutan WAJIB: broker duluan (engine butuh broker buat konek) -> paired devices ->
 * engine (kalau ada device paired) -> publish layout -> registerIpcHandlers (sebelum
 * createWindow, karena renderer bisa langsung panggil IPC begitu window muncul).
 *
 * `registerIpcHandlers(config)` HARUS jalan tepat SEKALI, apa pun yang terjadi di atasnya —
 * makanya dia satu-satunya panggilan, di `finally`, bukan diulang di tiap early-return.
 * Kalau tidak, device yang belum di-pairing dengan benar (mis. accessCode kosong bikin
 * `BambuMqttConnector` throw di `startEngine`) bisa reject seluruh `bootstrap()` dan
 * renderer jadi tak punya IPC sama sekali buat recover — lihat juga try/catch di
 * `app.on('ready', ...)` di bawah yang menjamin `createWindow()` tetap jalan.
 */
async function bootstrap(): Promise<void> {
  log.initialize()
  log.errorHandler.startCatching() // uncaught exceptions + unhandled rejections -> log file automatically
  Object.assign(console, log.functions) // route console.log/console.error/etc through electron-log too, so uploaded logs actually contain startup diagnostics (SaaS base URL, LAN IP candidates) instead of being near-empty
  const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL)
  try {
    const base = config.saasBaseUrl
    if (base) {
      console.log(`[agent] SaaS base URL: ${base}`)
    } else {
      logger.error(
        '[agent] SAAS_BASE_URL KOSONG — build ini tak tahu harus menghubungi server Slizebiz yang mana. ' +
          'Aktivasi/sync/layout PASTI gagal ("network_error"). Cek config.json di direktori data aplikasi.',
      )
    }
    // Alamat ini yang diketik user ke captive-portal WiFi CYD; catat SEMUA kandidat biar
    // kalau tebakan utama salah (adapter virtual/VPN) masih ada jejak buat support.
    console.log('[agent] kandidat IP LAN (urut prioritas):', listLocalIpCandidates().join(', ') || '(tidak ada)')

    // Cek sekali di awal apakah penyimpanan kredensial lokal sehat (go-public #9) --
    // {ok:false} berarti safeStorage tak tersedia ATAU file ada tapi gagal didekripsi.
    // Kedua kasus bikin loadCredentials() di manapun selalu balik EMPTY_BLOB diam-diam
    // (user seolah belum pernah aktivasi) DAN ensureBrokerPin() di bawah jatuh ke PIN
    // session-only (berubah tiap restart) -- flag ini yang bikin AgentShell bisa kasih
    // tahu user, bukan diam total seperti sebelumnya.
    const credentialResult = await credentialStore.load()
    setCredentialStoreDegraded(credentialResult.status === 'degraded')
    if (credentialResult.status === 'degraded') {
      logger.error('[agent] penyimpanan kredensial lokal bermasalah (safeStorage tak tersedia atau file gagal didekripsi) -- PIN broker session-only, minta user restart/cek support')
    }

    // PIN diresolusi SEBELUM broker start -- authenticate handler broker.ts butuh PIN final
    // di tangan pas server.listen() dipanggil, tak bisa dipasang belakangan.
    const brokerPin = await ensureBrokerPin(credentialStore, logger)
    setBrokerPin(brokerPin)

    const brokerResult = await startBroker(1883, brokerPin)
    if (!brokerResult.ok) {
      logger.error(
        `[agent] broker MQTT lokal gagal start (${brokerResult.reason}) — monitoring lokal tak akan jalan`,
      )
      return
    }
    setBrokerPort(brokerResult.port)

    const paired = await buildPairedDevices(base, credentialStore, pathProvider, buildInfo, logger)
    if (paired.length > 0) {
      const started = await startEngine(paired, brokerResult.port, brokerPin, logger)
      setEngine(started.engine)
      setReporters(started.reporters) // dilacak biar agent:sync bisa nutupnya pas ganti Engine
    }

    const blob = await loadCredentials(credentialStore)
    if (blob.agentToken) {
      await publishLayout(base, blob.agentToken, brokerResult.port, "default", brokerPin, logger)
    }
  } catch (err) {
    logger.error('[agent] bootstrap gagal di tengah jalan (broker/engine/layout) — IPC tetap didaftarkan biar renderer bisa recover', err)
  } finally {
    registerIpcHandlers(config)
  }
}

/**
 * Deliberately independent from bootstrap() -- bootstrap() returns early (index.ts, when the
 * broker fails to start) and the update check must still run in exactly that case (the user
 * most needs to know a fix might be available). Called from app.on('ready') AFTER bootstrap(),
 * not from inside it.
 */
async function startUpdateChecks(): Promise<void> {
  const blob = await loadCredentials(credentialStore)
  if (!blob.agentToken) return
  const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL)
  const platform = process.platform === 'darwin' ? 'mac' : 'win'
  const check = async () => {
    const result = await fetchLatestVersion(config.saasBaseUrl, blob.agentToken!, platform, buildInfo, logger)
    if (result.ok) setUpdateAvailable(result.data.updateAvailable)
  }
  await check()
  const timer = setInterval(check, 6 * 60 * 60 * 1000)
  timer.unref?.()
}

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      // Window bisa dalam keadaan hidden (di-close user, disembunyikan ke tray) -- .focus()
      // saja tak cukup buat window yang tak kelihatan.
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('ready', async () => {
    try {
      await bootstrap()
      void startUpdateChecks().catch((err) => logger.error('[agent] update check gagal', err))
    } catch (err) {
      // Pertahanan lapis kedua: bootstrap() sendiri sudah menangkap error internalnya
      // dan selalu registerIpcHandlers() di finally, tapi kalau registerIpcHandlers()
      // ITU SENDIRI yang throw (mis. re-registrasi channel), jangan sampai window juga
      // gagal muncul — window HARUS selalu dibuat.
      logger.error('[agent] bootstrap gagal total', err)
    } finally {
      disableApplicationMenu()
      mainWindow = createWindow()
      attachHideOnClose(mainWindow, () => isQuitting)
      createTray(
        () => mainWindow,
        () => {
          isQuitting = true
          app.quit()
        },
      )
    }
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
}
