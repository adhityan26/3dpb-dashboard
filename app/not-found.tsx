import Link from "next/link"

// Server component — no "use client" to avoid SSR error fallback
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#060614", color: "rgba(255,255,255,0.7)" }}>
      <div className="text-6xl font-bold" style={{ color: "rgba(255,255,255,0.15)" }}>404</div>
      <div className="text-lg font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Halaman tidak ditemukan</div>
      <Link href="/order" className="mt-4 h-9 px-5 rounded-[10px] text-sm font-semibold text-white flex items-center"
            style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}>
        ← Kembali ke Dashboard
      </Link>
    </div>
  )
}
