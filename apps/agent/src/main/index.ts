import { app, BrowserWindow } from 'electron'
import { createWindow, disableApplicationMenu } from './window'
import { createTray } from './tray'
import { attachHideOnClose } from './window-lifecycle'
import { AgentRuntime, loadOrCreateConfig } from '@3pb/agent-core'
import { registerIpcHandlers } from './ipc'
import { initRuntime } from './app-state'
import { SafeStorageCredentialStore, ElectronPathProvider, ElectronLogAdapter, getElectronBuildInfo, ElectronLogFileProvider } from './platform-electron'
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
  const updatePlatform = process.platform === 'darwin' ? 'mac' : 'win'
  const runtime = new AgentRuntime({
    credentialStore,
    pathProvider,
    logger,
    logFileProvider: new ElectronLogFileProvider(),
    buildInfo,
    saasBaseUrl: config.saasBaseUrl,
    updatePlatform,
  })
  initRuntime(runtime)
  try {
    await runtime.start()
  } catch (err) {
    logger.error('[agent] runtime.start() gagal total', err)
  } finally {
    registerIpcHandlers(config)
  }
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
