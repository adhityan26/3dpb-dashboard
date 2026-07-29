import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldNotify, sendFailureNotification } from './notify'

describe('shouldNotify', () => {
  const HOUR = 60 * 60 * 1000

  it('belum pernah notify -> true', () => {
    expect(shouldNotify(null, Date.now(), 6)).toBe(true)
  })

  it('notify terakhir masih dalam cooldown -> false', () => {
    const now = Date.now()
    expect(shouldNotify(now - 2 * HOUR, now, 6)).toBe(false)
  })

  it('notify terakhir sudah lewat cooldown -> true', () => {
    const now = Date.now()
    expect(shouldNotify(now - 7 * HOUR, now, 6)).toBe(true)
  })

  it('notify terakhir pas di batas cooldown -> false (belum lewat)', () => {
    const now = Date.now()
    expect(shouldNotify(now - 6 * HOUR, now, 6)).toBe(false)
  })
})

describe('sendFailureNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('mengirim POST ke wa-omni dengan nomor tujuan dan pesan', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendFailureNotification(
      {
        waOmniEndpoint: 'http://192.168.88.92:3020',
        waOmniToken: 'tok123',
        waOmniTargetNumber: '628123456789',
        waOmniAccountId: 1,
      },
      'Refresh gagal, perlu login manual via VNC',
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://192.168.88.92:3020/api/send')
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer tok123')
    expect(opts.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(opts.body)
    expect(body.phone).toBe('628123456789')
    expect(body.body).toBe('Refresh gagal, perlu login manual via VNC')
    expect(body.account_id).toBe(1)
  })

  it('response non-ok -> throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    await expect(
      sendFailureNotification(
        {
          waOmniEndpoint: 'http://192.168.88.92:3020',
          waOmniToken: 'tok123',
          waOmniTargetNumber: '628123456789',
          waOmniAccountId: 1,
        },
        'pesan',
      ),
    ).rejects.toThrow()
  })
})
