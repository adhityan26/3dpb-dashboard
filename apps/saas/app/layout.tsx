import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Providers } from "./providers";
import { AmbientOrbs } from "@/components/AmbientOrbs";
import { UpdateBanner } from "@/components/UpdateBanner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Slizebiz — kalkulator harga jual produk 3D print",
  description: "Hitung biaya modal & harga jual produk 3D print-mu. Powered by 3D Printing Bandung.",
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={inter.variable}>
      <body className="bg-glass-page">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <UpdateBanner />
          <AmbientOrbs />
          <Providers>{children}</Providers>
          {/* Versi build -- z-30 (di bawah UpdateBanner z-60 & MobileBottomNav z-50) sengaja,
              & digeser bottom-[68px] di mobile supaya tak ketutup MobileBottomNav (PageShell,
              tinggi 68px, tampil di semua halaman ber-auth). Halaman tanpa PageShell (mis.
              /login) jadinya ada sedikit gap kosong di bawah -- trade-off yang diterima demi
              benar di kasus mayoritas (halaman ber-auth). */}
          <div className="fixed bottom-[68px] md:bottom-0 left-0 right-0 z-30 bg-black/40 backdrop-blur border-t border-white/10 py-1.5 px-4 text-center md:text-right pointer-events-none">
            <span className="text-[7px] md:text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
              {`${process.env.NEXT_PUBLIC_BUILD_DATE}.${process.env.NEXT_PUBLIC_BUILD_HASH}`}
            </span>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
