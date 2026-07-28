import { chromium } from 'playwright'

export async function refreshTokopediaSession(
  cfg: { browserProfileDir: string; dashboardUrl: string; internalServiceToken: string },
): Promise<{ success: true } | { success: false; error: string }> {
  const context = await chromium.launchPersistentContext(cfg.browserProfileDir, {
    headless: false, // false so the always-on Xvfb+VNC display shows it live
  })
  try {
    const page = await context.newPage()
    await page.goto('https://seller-id.tokopedia.com/', { waitUntil: 'networkidle' })
    await page.click('button:has-text("Masuk dengan akun TikTok")')
    await page.waitForURL('**/seller-id.tokopedia.com/homepage**', { timeout: 30_000 })

    const cookies = await context.cookies()
    const hasSellerToken = cookies.some((c) => c.name === 'SELLER_TOKEN')
    if (!hasSellerToken) {
      return { success: false, error: 'Login selesai tapi SELLER_TOKEN tidak ditemukan di cookie — flow mungkin belum lengkap' }
    }

    const res = await fetch(`${cfg.dashboardUrl}/api/tokopedia/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': cfg.internalServiceToken },
      body: JSON.stringify({ cookies: cookies.map((c) => ({ name: c.name, value: c.value })) }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { success: false, error: `Dashboard menolak sesi baru: HTTP ${res.status} ${body}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await context.close()
  }
}
