import { app, Tray, Menu, nativeImage, type BrowserWindow } from 'electron'
import path from 'path'

/**
 * Ikon tray dimuat dari `resources/tray-icon.png` lewat `app.getAppPath()` -- BUKAN lewat
 * pipeline renderer (Vite public/) yang perilaku dev-vs-packaged-nya beda (public/ cuma
 * ke-copy ke `out/renderer/` saat build, tak ada sama sekali di electron-vite dev mode).
 * `app.getAppPath()` konsisten di kedua mode: root project (`apps/agent`) waktu dev, root
 * asar waktu packaged -- selama `resources/**` didaftarkan di `files:` electron-builder.yml.
 */
export function createTray(getWindow: () => BrowserWindow | null, onQuit: () => void): Tray {
  const iconPath = path.join(app.getAppPath(), 'resources', 'tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  const tray = new Tray(icon)
  tray.setToolTip('Slizebiz Agent')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Buka Slizebiz Agent',
        click: () => {
          const win = getWindow()
          win?.show()
          win?.focus()
        },
      },
      { type: 'separator' },
      { label: 'Keluar', click: onQuit },
    ]),
  )
  // Klik kiri ikon tray (bukan context menu) -- toggle show/hide, konvensi umum tray icon.
  tray.on('click', () => {
    const win = getWindow()
    if (!win) return
    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })
  return tray
}
