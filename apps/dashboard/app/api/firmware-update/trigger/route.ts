import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { auth } from '@/lib/auth'
import { getDeviceStatus } from '@/lib/firmware-update/device-status'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const device = await getDeviceStatus()
  if (!device) {
    return NextResponse.json({ success: false, message: 'Device tidak terdeteksi (belum publish status via MQTT)' }, { status: 400 })
  }

  let bin: Buffer
  try {
    bin = await readFile('/app/firmware/firmware.bin')
  } catch {
    return NextResponse.json({ success: false, message: 'Belum ada firmware ter-build — jalankan build-and-publish-firmware.sh dulu' }, { status: 400 })
  }

  const form = new FormData()
  form.append('firmware', new Blob([Uint8Array.from(bin)]), 'firmware.bin')

  try {
    const res = await fetch(`http://${device.ip}/ota-upload`, {
      method: 'POST',
      headers: { 'X-OTA-Password': process.env.CYD_OTA_PASSWORD ?? '' },
      body: form,
      signal: AbortSignal.timeout(30000),
    })
    const text = await res.text()
    return NextResponse.json({ success: res.ok && text === 'OK', message: text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'gagal connect ke device'
    return NextResponse.json({ success: false, message: msg }, { status: 502 })
  }
}
