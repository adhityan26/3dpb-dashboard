import { firefox } from 'playwright-core'
import { launchOptions } from 'camoufox-js'
import { rm } from 'fs/promises'
import { join } from 'path'

// Camoufox = build Firefox yang dipatch anti-fingerprint/anti-deteksi-bot — dipakai
// (bukan Chromium biasa) karena TikTok/Tokopedia diam-diam menolak login (QR tak
// bereaksi, OTP tak terkirim) saat mendeteksi Chromium+Playwright standar via
// fingerprint otomasi. `launchOptions()` dari camoufox-js menghasilkan opsi
// Playwright-compatible (args, executablePath, firefoxUserPrefs) yang dioper
// langsung ke `firefox.launchPersistentContext()` asli — sisa API (newPage,
// cookies, close) tetap Playwright standar, tidak berubah.

// Kalau proses sebelumnya mati mendadak (container restart, OOM, dst) tanpa sempat
// context.close(), browser meninggalkan file lock di profile dir dan menolak launch
// berikutnya ("profile appears to be in use") walau tak ada proses lain yang benar-benar
// jalan. Aman dihapus di awal tiap attempt karena hanya satu proses refresh yang pernah
// jalan bersamaan (loop scheduler serial, bukan paralel). Firefox/Camoufox pakai
// `.parentlock` (symlink) + `lock`, beda dari skema Singleton* milik Chromium.
async function clearStaleSingletonLocks(profileDir: string): Promise<void> {
  for (const name of ['.parentlock', 'lock']) {
    await rm(join(profileDir, name), { force: true })
  }
}

export async function refreshTokopediaSession(
  cfg: { browserProfileDir: string; dashboardUrl: string; internalServiceToken: string },
): Promise<{ success: true } | { success: false; error: string }> {
  let context: Awaited<ReturnType<typeof firefox.launchPersistentContext>> | undefined
  try {
    await clearStaleSingletonLocks(cfg.browserProfileDir)
    context = await firefox.launchPersistentContext(cfg.browserProfileDir, {
      // headless:false supaya selalu tampil live di Xvfb+VNC. exclude_addons: ['UBO']
      // karena default addon (uBlock Origin) Camoufox coba di-download dari
      // addons.mozilla.org saat launch — kalau jaringan ke situ diblokir/lambat,
      // launchOptions() gagal dengan "manifest.json is missing" (dikonfirmasi via
      // smoke test); addon ini tidak dibutuhkan untuk automasi login, aman di-skip.
      ...(await launchOptions({ headless: false, exclude_addons: ['UBO'] })),
    })
    const page = await context.newPage()
    // 'networkidle' TERBUKTI tidak pernah tercapai di halaman ini (timeout 30s berulang
    // kali di produksi) — situs e-commerce ini terus kirim request background (analytics,
    // dst) sehingga network tak pernah benar-benar idle. 'domcontentloaded' cukup cepat
    // dan reliabel; status login yang sesungguhnya (redirect ke /homepage vs tombol
    // TikTok muncul) dicek langsung sesudahnya dengan wait terpisah yang lebih toleran.
    await page.goto('https://seller-id.tokopedia.com/', { waitUntil: 'domcontentloaded' })
    await Promise.race([
      page.waitForURL('**/seller-id.tokopedia.com/homepage**', { timeout: 30_000 }).catch(() => {}),
      page.waitForSelector('button:has-text("Masuk dengan akun TikTok")', { timeout: 30_000 }).catch(() => {}),
    ])
    const alreadyLoggedIn = page.url().includes('/homepage')
    if (!alreadyLoggedIn) {
      await page.click('button:has-text("Masuk dengan akun TikTok")')
      await page.waitForURL('**/seller-id.tokopedia.com/homepage**', { timeout: 30_000 })
    }

    const cookies = await context.cookies('https://seller-id.tokopedia.com/')
    const hasSellerToken = cookies.some((c) => c.name === 'SELLER_TOKEN')
    if (!hasSellerToken) {
      return { success: false, error: 'Login selesai tapi SELLER_TOKEN tidak ditemukan di cookie — flow mungkin belum lengkap' }
    }

    const userAgent = await page.evaluate(() => navigator.userAgent)
    const cookiesWithUA = [
      ...cookies.map((c) => ({ name: c.name, value: c.value })),
      { name: '_user_agent', value: userAgent },
    ]

    const res = await fetch(`${cfg.dashboardUrl}/api/tokopedia/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': cfg.internalServiceToken },
      body: JSON.stringify({ cookies: cookiesWithUA }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { success: false, error: `Dashboard menolak sesi baru: HTTP ${res.status} ${body}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (context) await context.close()
  }
}
