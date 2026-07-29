import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { startBroker } from './broker'
import { buildPairedDevices } from './startup'
import { startEngine } from './engine-manager'
import { publishLayout } from './layout-publisher'
import { loadCredentials } from './credential-store'
import { registerIpcHandlers } from './ipc'
import { setEngine, setBrokerPort } from './app-state'

const gotLock = app.requestSingleInstanceLock()

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
    const brokerResult = await startBroker()
    if (!brokerResult.ok) {
      console.error('[agent] broker gagal start (port 1883 dipakai proses lain) — monitoring lokal tak akan jalan')
      return
    }
    setBrokerPort(brokerResult.port)

    const paired = await buildPairedDevices()
    if (paired.length > 0) {
      setEngine(await startEngine(paired, brokerResult.port))
    }

    const blob = await loadCredentials()
    if (blob.agentToken) {
      await publishLayout(blob.agentToken, brokerResult.port)
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
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
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
      createWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}
