import { BrowserWindow, app } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'
import { isDev } from './utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  })

  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../renderer/index.html')}`

  mainWindow.loadURL(url)

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  return mainWindow
}
