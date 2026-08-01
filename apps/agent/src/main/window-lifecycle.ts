import type { BrowserWindow } from 'electron'

/**
 * App ini dirancang jalan terus di background (broker MQTT + monitoring printer tetap
 * harus hidup walau window ditutup, sama seperti Mac konvensional) -- jadi close window
 * SENGAJA cuma menyembunyikannya, bukan quit beneran. Quit asli cuma lewat tray ("Keluar")
 * atau Cmd+Q di mac, yang keduanya men-set `shouldQuit()` jadi true LEBIH DULU (lewat
 * `before-quit`) sebelum window benar-benar ditutup.
 */
export function attachHideOnClose(window: BrowserWindow, shouldQuit: () => boolean): void {
  window.on('close', (event) => {
    if (!shouldQuit()) {
      event.preventDefault()
      window.hide()
    }
  })
}
