import type { ReactNode } from "react";
import { GlassCard } from "@3pb/ui";

export function AgentShell({
  children,
  maxWidth = "max-w-xl",
}: {
  children: ReactNode;
  // Class Tailwind max-width — default "max-w-xl" cocok untuk Activation/Dashboard (satu
  // kolom). PairingScreen mengoper "max-w-3xl" karena isinya 3 kolom side-by-side yang
  // kesempitan kalau dipaksa ke 576px (final review Finding 5).
  maxWidth?: string;
}) {
  return (
    <div className="bg-glass-page min-h-screen flex flex-col items-center justify-center p-6">
      {/* Path RELATIF ("./logo.svg"), bukan absolut ("/logo.svg") — di app terpaket, HTML
          dimuat lewat file:// (window.ts), dan Vite tidak menulis-ulang string literal di
          dalam bundle JS (hanya referensi aset di HTML sendiri yang di-rewrite jadi
          relatif). Path absolut resolve ke root filesystem (file:///logo.svg, tidak ada)
          -> logo jadi broken image di app terpaket meski OK di dev server (final review
          Finding 2). */}
      <img src="./logo.svg" alt="Slizebiz" className="h-8 mb-6" />
      <GlassCard className={`w-full ${maxWidth} p-6`}>{children}</GlassCard>
    </div>
  );
}
