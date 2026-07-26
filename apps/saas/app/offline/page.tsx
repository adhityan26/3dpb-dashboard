"use client";

// Halaman TANPA auth()/PageShell secara sengaja — harus bisa dirender murni dari
// cache tanpa network, sama seperti /login yang juga di luar PageShell (lihat spec).
export default function OfflinePage() {
  return (
    <main className="max-w-sm mx-auto p-6 mt-16 text-center">
      <img src="/logo.svg" alt="Slizebiz" width={44} height={44} className="mb-3 mx-auto" />
      <h1 className="text-lg font-semibold g-t1 mb-1">Kamu sedang offline</h1>
      <p className="text-[13px] g-t4 mb-4">
        Halaman ini belum pernah dibuka sebelumnya, jadi butuh koneksi internet dulu.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="g-btn-ghost h-10 px-4 rounded-[5px] text-[13px]"
      >
        Coba lagi
      </button>
    </main>
  );
}
