// ESC/POS over BLE (Web Bluetooth API)
// Compatible with Phomemo, Peripage, Munbyn, GOOJPRT and similar BLE label printers

const PRINTER_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb"
const PRINTER_CHARACTERISTIC = "00002af1-0000-1000-8000-00805f9b34fb"

export async function connectPrinter(): Promise<BluetoothRemoteGATTCharacteristic> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [PRINTER_SERVICE] }],
  })

  if (!device.gatt) throw new Error("GATT server tidak tersedia pada perangkat ini.")
  const server = await device.gatt.connect()
  const service = await server.getPrimaryService(PRINTER_SERVICE)
  const characteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC)
  return characteristic
}

export async function printStickerViaBluetooth(
  characteristic: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array
): Promise<void> {
  // Split into 20-byte chunks (BLE MTU limit for write without response)
  const CHUNK_SIZE = 20
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE)
    await characteristic.writeValueWithoutResponse(chunk)
    // Small delay between chunks to avoid buffer overflow
    await new Promise((r) => setTimeout(r, 10))
  }
}

export function buildStickerEscPos(
  qrData: string,
  label: string,
  subLabel: string
): Uint8Array {
  const ESC = 0x1b
  const GS = 0x1d

  const enc = new TextEncoder()

  const init = [ESC, 0x40]           // ESC @ — init printer
  const center = [ESC, 0x61, 0x01]   // ESC a 1 — center
  const lineFeed = [0x0a]             // LF
  const cut = [GS, 0x56, 0x42, 0x00] // GS V B 0 — full cut with feed

  // QR code: GS ( k — Store data
  const qrBytes = enc.encode(qrData)
  const storeLen = qrBytes.length + 3
  const qrStore = [
    GS, 0x28, 0x6b,
    storeLen & 0xff, (storeLen >> 8) & 0xff,
    0x31, 0x50, 0x30,
    ...Array.from(qrBytes),
  ]
  // QR code: set size (6), error correction (M), print
  const qrSize  = [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]
  const qrEcc   = [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]
  const qrPrint = [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]

  // Warning: Most BLE thermal printers expect ASCII/Latin-1.
  // Non-ASCII characters (e.g. multi-byte UTF-8) may print as garbage.
  // Ensure label and subLabel contain only printable ASCII characters.
  const labelBytes = enc.encode(label)
  const subLabelBytes = enc.encode(subLabel)

  const bytes = [
    ...init,
    ...center,
    ...qrStore,
    ...qrSize,
    ...qrEcc,
    ...qrPrint,
    ...lineFeed,
    ...Array.from(labelBytes),
    ...lineFeed,
    ...Array.from(subLabelBytes),
    ...lineFeed,
    ...lineFeed,
    ...cut,
  ]

  return new Uint8Array(bytes)
}
