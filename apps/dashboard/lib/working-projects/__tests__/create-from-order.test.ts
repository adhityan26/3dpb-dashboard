import { describe, it, expect } from 'vitest'
import { describeCreateResult } from '../create-from-order'

describe('describeCreateResult', () => {
  it('reports a Discord failure even though the API returned success', () => {
    const fb = describeCreateResult({ id: 'w', threadUrl: null, syncState: 'error', skipped: false, syncError: 'discord-relay 403: {"error":"forbidden_channel"}' })
    expect(fb.ok).toBe(false)
    expect(fb.text).toContain('forbidden_channel')
  })

  it('distinguishes a new WP from an existing one', () => {
    expect(describeCreateResult({ id: 'w', threadUrl: 'u', syncState: 'ok', skipped: false })).toEqual({ ok: true, text: 'WP dibuat' })
    expect(describeCreateResult({ id: 'w', threadUrl: 'u', syncState: 'ok', skipped: true }).text).toBe('WP sudah ada untuk order ini')
  })
})
