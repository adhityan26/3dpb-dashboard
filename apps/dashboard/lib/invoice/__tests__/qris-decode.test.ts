import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import { decodeQrisImage } from '../qris-decode'

describe('decodeQrisImage', () => {
  it('decodes a real QR code image back to its original payload text', async () => {
    const payload = '000201010211520454115303360' + '5802ID5912TESTMERCHANT6007JAKARTA6304ABCD'
    const dataUrl = await QRCode.toDataURL(payload, { type: 'image/png' })

    const result = await decodeQrisImage(dataUrl)

    expect(result).toBe(payload)
  })

  it('returns null when the QR code decodes to a non-EMVCo payload (e.g. a plain URL)', async () => {
    const dataUrl = await QRCode.toDataURL('https://example.com/pay/abc', { type: 'image/png' })

    const result = await decodeQrisImage(dataUrl)

    expect(result).toBeNull()
  })

  it('returns null for an image that has no QR code in it', async () => {
    // 1x1 transparent PNG data URL — a valid image, no QR code
    const blankPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

    const result = await decodeQrisImage(blankPng)

    expect(result).toBeNull()
  })
})
