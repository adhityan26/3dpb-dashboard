export const APP_URL = "https://app.slizebiz.com";
export const CONTENT = {
  brand: "slizebiz",
  poweredBy: "powered by 3D Printing Bandung",
  heroHeadline: "Tahu harga jual produk 3D print-mu dalam hitungan detik",
  heroSub: "Hitung biaya modal, harga jual minimum, dan rekomendasi harga — gratis, tanpa daftar.",
  valueProps: [
    { icon: "🎯", title: "Harga akurat", desc: "Material, buffer gagal, listrik + depresiasi mesin ikut dihitung — bukan cuma tebak." },
    { icon: "🏷️", title: "Per channel", desc: "Rekomendasi harga untuk offline & marketplace, sekali klik." },
    { icon: "💾", title: "Simpan & kelola", desc: "Simpan kalkulasi, multi-plate, labor & settings custom — di app (segera)." },
  ],
  faq: [
    { q: "Perlu bayar untuk coba?", a: "Tidak. Kalkulator teaser gratis dan tanpa daftar." },
    { q: "Data saya aman?", a: "Teaser tidak menyimpan apa pun. Waitlist hanya menyimpan email untuk kabar rilis." },
    { q: "Kapan app rilis?", a: "Sedang dibangun. Masuk waitlist untuk diberi tahu duluan." },
  ],
} as const;

export const TIERS = [
  { id: "free", nama: "Free", harga: "Rp 0", fitur: ["Kalkulator dasar", "Margin A/B/C + status", "Tanpa simpan"] },
  { id: "beli", nama: "Beli", harga: "Segera hadir", interest: "beli" as const, highlight: true,
    fitur: ["Miliki aplikasinya — selamanya", "Semua fitur inti, offline", "Simpan, multi-plate, labor, settings"] },
  { id: "subscribe", nama: "Subscribe", harga: "Segera hadir", interest: "subscribe" as const,
    fitur: ["Sync antar device (cloud)", "OCR & share invoice", "Butuh langganan"] },
];
