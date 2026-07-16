import type { Notifier } from '../engine'
import type { PrinterEvent } from '../types'

export interface PushoverOpts { token: string; user: string; fetchImpl?: typeof fetch }

export class PushoverNotifier implements Notifier {
  constructor(private opts: PushoverOpts) {}
  async notify(e: PrinterEvent, ctx: { printerName: string; hmsText: string[] }): Promise<void> {
    if (e.kind !== 'error') return
    const f = this.opts.fetchImpl ?? fetch
    const message = `${ctx.printerName}: PRINT ERROR — ${ctx.hmsText.join(' | ') || e.status.errorDetails}`
    await f('https://api.pushover.net/1/messages.json', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: this.opts.token, user: this.opts.user, message }),
    })
  }
}
