export const metadata = { title: "Kebijakan Privasi · Slizebiz" };
export default function Privasi() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-12 space-y-4 g-t2 text-sm leading-relaxed">
      <h1 className="text-xl font-bold g-t1">Kebijakan Privasi</h1>
      <p className="text-[11px] g-t5">Template ringkas, akan disempurnakan. Berlaku hukum Republik Indonesia (UU PDP).</p>

      <p><b className="g-t1">Kalau kamu baru mengisi waitlist</b> (belum punya akun app): kami hanya menyimpan alamat email dan pilihan minat (Pro/Subscribe) yang kamu kirim lewat form, di Cloudflare D1, untuk memberi tahu saat produk rilis. Minta hapus kapan saja via kontak di footer.</p>

      <p><b className="g-t1">Kalau kamu sudah punya akun app (Slizebiz).</b> Data yang kami kumpulkan:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Alamat email atau nomor WhatsApp — untuk login (tautan sekali-pakai atau kode OTP), tidak untuk dijual/dibagikan buat pemasaran.</li>
        <li>Foto bukti pembayaran — kalau kamu beli Pro, disimpan sementara di Cloudflare R2 untuk diverifikasi admin, terhapus otomatis dalam 60 hari.</li>
        <li>Riwayat pembayaran (nominal, status) — untuk mengaktifkan & melacak akses Pro-mu.</li>
      </ul>

      <p><b className="g-t1">Data kalkulasi HPP kamu tetap di device-mu.</b> Riwayat kalkulasi, settings printer/material/harga custom — disimpan lokal di browser (IndexedDB), <b>tidak dikirim atau disimpan di server kami</b>. Kalau kamu ganti device/hapus data browser, riwayat itu hilang (belum ada sinkronisasi cloud).</p>

      <p><b className="g-t1">Pihak ketiga yang kami pakai.</b> <a href="https://resend.com" className="underline">Resend</a> (kirim email login) dan layanan pengirim pesan WhatsApp pihak ketiga (kirim kode OTP) — masing-masing cuma menerima email/nomor yang perlu untuk mengirimkan kode itu, tidak untuk keperluan lain.</p>

      <p><b className="g-t1">Teaser kalkulator</b> (di landing ini, sebelum login). Perhitungan berjalan di browser-mu dan tidak dikirim atau disimpan di server kami.</p>

      <p><b className="g-t1">Hak kamu.</b> Minta hapus akun & seluruh data yang kami simpan (email/nomor, riwayat pembayaran, bukti bayar) kapan saja via kontak di footer.</p>

      <p><a href="/" className="g-accent underline">← Kembali</a></p>
    </main>
  );
}
