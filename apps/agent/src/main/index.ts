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
 */
async function bootstrap(): Promise<void> {
  const brokerResult = await startBroker()
  if (!brokerResult.ok) {
    console.error('[agent] broker gagal start (port 1883 dipakai proses lain) — monitoring lokal tak akan jalan')
    registerIpcHandlers() // tetap daftarkan IPC biar renderer bisa tampilkan pesan error, bukan macet total
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

  registerIpcHandlers()
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
    await bootstrap()
    createWindow()
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
