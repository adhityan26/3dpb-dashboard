import { describe, it, expect, vi } from 'vitest'
import { TelegramNotifier, escapeMdV2 } from '../notifiers/telegram'
import { PushoverNotifier } from '../notifiers/pushover'
import { normalizeBambu } from '../normalize-bambu'
import type { PrinterEvent } from '../types'

const ev = (kind: PrinterEvent['kind']): PrinterEvent => ({
  deviceId: 'mars', kind, prevState: 'running',
  status: normalizeBambu('mars', { print: { gcode_state: 'FAILED', subtask_name: 'file_a.3mf', task_id: 't1', mc_percent: 40 } }),
})

describe('escapeMdV2', () => {
  it('escape karakter reserved', () => {
    expect(escapeMdV2('a_b*c[d')).toBe('a\\_b\\*c\\[d')
  })
})

describe('TelegramNotifier', () => {
  it('POST sendMessage per chatId dgn template sesuai event', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return new Response('{}')
    })
    const n = new TelegramNotifier({ botToken: 'TOK', chatIds: ['1', '2'], fetchImpl: fetchImpl as unknown as typeof fetch })
    await n.notify(ev('error'), { printerName: 'Mars', hmsText: ['[1201_8007] Extruder clogged.'] })
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe('https://api.telegram.org/botTOK/sendMessage')
    expect(String(calls[0].body.text)).toContain('PRINT ERROR')
    expect(String(calls[0].body.text)).toContain('Extruder clogged')
    expect(calls[0].body.parse_mode).toBe('MarkdownV2')
  })
})

describe('PushoverNotifier', () => {
  it('kirim hanya utk error', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'))
    const n = new PushoverNotifier({ token: 't', user: 'u', fetchImpl: fetchImpl as unknown as typeof fetch })
    await n.notify(ev('started'), { printerName: 'Mars', hmsText: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
    await n.notify(ev('error'), { printerName: 'Mars', hmsText: [] })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.pushover.net/1/messages.json', expect.anything())
  })
})
