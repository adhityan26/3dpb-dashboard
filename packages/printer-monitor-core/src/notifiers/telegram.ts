import type { Notifier } from '../engine'
import type { PrinterEvent } from '../types'

export const escapeMdV2 = (s: string) => s.replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1')

export interface TelegramOpts { botToken: string; chatIds: string[]; fetchImpl?: typeof fetch }

function template(e: PrinterEvent, printerName: string, hmsText: string[]): string {
  const s = e.status
  const esc = escapeMdV2
  if (e.kind === 'started') {
    return `🟢 *PRINT STARTED*\n\n🖨 *Printer* : ${esc(printerName)}\n📄 *File*    : \`${esc(s.file || '-')}\`\n🆔 *Task*    : ${esc(s.taskId || '-')}\n\n📊 *Progress* : ${esc(String(s.progress))}%`
  }
  if (e.kind === 'error') {
    const details = hmsText.length ? hmsText.join('\n') : s.errorDetails
    return `🔴 *PRINT ERROR*\n\n🖨 *Printer* : ${esc(printerName)}\n📄 *File*    : \`${esc(s.file || '-')}\`\n🆔 *Task*    : ${esc(s.taskId || '-')}\n\n⚠️ *Details* : ${esc(details)}`
  }
  const wib = new Date(Date.parse(s.eventTime) + 7 * 3600_000).toISOString().slice(11, 16)
  return `✅ Print finished\nPrinter: ${esc(printerName)}\nFile: ${esc(s.file || '-')}\nTask ID: ${esc(s.taskId || '-')}\nFinished at: ${wib} WIB`
}

export class TelegramNotifier implements Notifier {
  constructor(private opts: TelegramOpts) {}
  async notify(e: PrinterEvent, ctx: { printerName: string; hmsText: string[] }): Promise<void> {
    const f = this.opts.fetchImpl ?? fetch
    const text = template(e, ctx.printerName, ctx.hmsText)
    for (const chatId of this.opts.chatIds) {
      await f(`https://api.telegram.org/bot${this.opts.botToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
      })
    }
  }
}
