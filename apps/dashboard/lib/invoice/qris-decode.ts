import jsQR from 'jsqr'
import { Jimp } from 'jimp'

/**
 * Decode a QR code from an uploaded image (as a data URL) into its raw text
 * payload. Returns null if the image doesn't contain a readable QR code —
 * callers must treat that as "decode failed, fall back to static display",
 * never as a hard error.
 */
export async function decodeQrisImage(dataUrl: string): Promise<string | null> {
  const base64 = dataUrl.split(',')[1]
  if (!base64) return null

  const buffer = Buffer.from(base64, 'base64')
  const image = await Jimp.read(buffer)
  const { data, width, height } = image.bitmap

  const result = jsQR(new Uint8ClampedArray(data), width, height)
  return result ? result.data : null
}
