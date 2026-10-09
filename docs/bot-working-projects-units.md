# Bot AI: Working Project per unit (cuplikan untuk /app/CLAUDE.md)

Tempel bagian di bawah ini ke `/app/CLAUDE.md` bot ai-assistant (VM .92).

## Working Project per unit

- `GET /api/bot/working-projects?q=<nomor order>` sekarang bisa mengembalikan **beberapa WP** untuk satu order marketplace (satu WP per unit/ukuran). Jangan PATCH hanya baris pertama: tampilkan semua hasil ke user dan tanyakan WP/ukuran mana yang dimaksud sebelum mengubah apa pun.
- `POST /api/bot/working-projects` untuk order marketplace sebaiknya mengirim `units`:
  `[{ itemKey, productName, variantName, unitPrice, productId }]`. Tanpa `units`, WP gabungan lama tetap dibuat dan respons memuat field `warning`; sampaikan warning itu ke user.
- Invoice dibuat **satu per order** (mencakup semua WP order itu), bukan per WP. WP manual (tanpa order) tetap satu invoice per WP.
- Status dan due date WP-WP dalam satu order disinkronkan dari marketplace secara terpisah per WP, jadi nilainya bisa berbeda antar WP pada order yang sama.

## Cara menerapkan

1. Edit `/app/CLAUDE.md` di VM .92 (salin cuplikan di atas lewat `scp`).
2. Restart bot lewat PM2 sebagai user `botuser`.
3. Detail prosedur: lihat memori `reference_ai_assistant_bot` (endpoint `/api/bot/*` baru wajib didokumentasikan di `/app/CLAUDE.md`).
