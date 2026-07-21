import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Providers } from "./providers";
import { AmbientOrbs } from "@/components/AmbientOrbs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Slizebiz — kalkulator harga jual produk 3D print",
  description: "Hitung biaya modal & harga jual produk 3D print-mu. Powered by 3D Printing Bandung.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={inter.variable}>
      <body className="bg-glass-page">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AmbientOrbs />
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
