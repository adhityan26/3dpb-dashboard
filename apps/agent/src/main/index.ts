import { app, BrowserWindow } from 'electron'
import { createWindow, disableApplicationMenu } from './window'
import { createTray } from './tray'
import { attachHideOnClose } from './window-lifecycle'
import { startBroker } from './broker'
import { buildPairedDevices } from './startup'
import { startEngine } from './engine-manager'
import { publishLayout } from './layout-publisher'
import { loadCredentials, ensureBrokerPin } from './credential-store'
import { registerIpcHandlers } from './ipc'
import { saasBaseUrl } from './saas-client'
import { setEngine, setBrokerPort, setBrokerPin, setReporters, listLocalIpCandidates } from './app-state'

const gotLock = app.requestSingleInstanceLock()

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
 * `registerIpcHandlers()` HARUS jalan tepat SEKALI, apa pun yang terjadi di atasnya —
 * makanya dia satu-satunya panggilan, di `finally`, bukan diulang di tiap early-return.
 * Kalau tidak, device yang belum di-pairing dengan benar (mis. accessCode kosong bikin
 * `BambuMqttConnector` throw di `startEngine`) bisa reject seluruh `bootstrap()` dan
 * renderer jadi tak punya IPC sama sekali buat recover — lihat juga try/catch di
 * `app.on('ready', ...)` di bawah yang menjamin `createWindow()` tetap jalan.
 */
async function bootstrap(): Promise<void> {
  try {
    // Diagnostik startup: base URL SaaS di-inject saat BUILD (define di
    // electron.vite.config.ts). Kalau kosong, SEMUA panggilan SaaS bakal balik
    // "network_error" generik yang mustahil dibedakan dari internet mati — jadi
    // salah-konfigurasi build harus berteriak di sini, sekali, dengan jelas.
    const base = saasBaseUrl()
    if (base) {
      console.log(`[agent] SaaS base URL: ${base}`)
    } else {
      console.error(
        '[agent] SAAS_BASE_URL KOSONG — build ini tak tahu harus menghubungi server Slizebiz yang mana. ' +
          'Aktivasi/sync/layout PASTI gagal ("network_error"). Rebuild dengan SAAS_BASE_URL=<url> di environment build.',
      )
    }
    // Alamat ini yang diketik user ke captive-portal WiFi CYD; catat SEMUA kandidat biar
    // kalau tebakan utama salah (adapter virtual/VPN) masih ada jejak buat support.
    console.log('[agent] kandidat IP LAN (urut prioritas):', listLocalIpCandidates().join(', ') || '(tidak ada)')

    // PIN diresolusi SEBELUM broker start -- authenticate handler broker.ts butuh PIN final
    // di tangan pas server.listen() dipanggil, tak bisa dipasang belakangan.
    const brokerPin = await ensureBrokerPin()
    setBrokerPin(brokerPin)

    const brokerResult = await startBroker(1883, brokerPin)
    if (!brokerResult.ok) {
      console.error(
        `[agent] broker MQTT lokal gagal start (${brokerResult.reason}) — monitoring lokal tak akan jalan`,
      )
      return
    }
    setBrokerPort(brokerResult.port)

    const paired = await buildPairedDevices()
    if (paired.length > 0) {
      const started = await startEngine(paired, brokerResult.port, brokerPin)
      setEngine(started.engine)
      setReporters(started.reporters) // dilacak biar agent:sync bisa nutupnya pas ganti Engine
    }

    const blob = await loadCredentials()
    if (blob.agentToken) {
      await publishLayout(blob.agentToken, brokerResult.port, "default", brokerPin)
    }
  } catch (err) {
    console.error('[agent] bootstrap gagal di tengah jalan (broker/engine/layout) — IPC tetap didaftarkan biar renderer bisa recover', err)
  } finally {
    registerIpcHandlers()
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
      console.error('[agent] bootstrap gagal total', err)
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
