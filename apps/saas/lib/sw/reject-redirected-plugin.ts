/** Cache-write guard dipakai `app/sw.ts` — dipisah ke modul sendiri supaya
 *  bisa diuji tanpa perlu meng-instantiate seluruh service worker (yang
 *  butuh scope worker global `self`).
 *
 *  PENTING: `NetworkFirst` Serwist hanya memasang `cacheOkAndOpaquePlugin`
 *  bawaannya KALAU belum ada plugin lain yang mengimplementasikan
 *  `cacheWillUpdate` — plugin custom ini otomatis MENGGANTIKAN gate status
 *  bawaan, bukan menambahkannya. Karena itu cek `response.status` di sini
 *  juga secara eksplisit (bukan cuma `response.redirected`), supaya halaman
 *  error (4xx/5xx) tak ikut ke-cache untuk disajikan lagi saat offline. */
export const rejectRedirectedOrErrorPlugin = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.redirected || (response.status !== 200 && response.status !== 0) ? null : response,
};
