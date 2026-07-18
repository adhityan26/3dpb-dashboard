import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { auth } from '@/lib/auth'
import { getDeviceStatus } from '@/lib/firmware-update/device-status'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let latestVersion = 'unknown'
  try {
    latestVersion = (await readFile('/app/firmware/version.txt', 'utf8')).trim()
  } catch {
    // belum pernah di-build — biarkan 'unknown'
  }

  const device = await getDeviceStatus()

  return NextResponse.json({
    latestVersion,
    deviceVersion: device?.firmwareVersion ?? null,
    deviceIp: device?.ip ?? null,
    upToDate: device !== null && device.firmwareVersion === latestVersion,
  })
}
