import { readRetained } from '@/lib/cyd-layout/mqtt-client'

export interface DeviceStatus { ip: string; firmwareVersion: string }

export async function getDeviceStatus(): Promise<DeviceStatus | null> {
  const raw = await readRetained('3dpb/cyd/internal-rack/status')
  if (!raw) return null
  try {
    return JSON.parse(raw) as DeviceStatus
  } catch {
    return null
  }
}
