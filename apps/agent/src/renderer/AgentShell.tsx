import { type ReactNode, useEffect, useState } from "react";
import { GlassCard } from "@3pb/ui";
import { AGENT_BUILD_ID } from "./lib/build-info";

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
  const [credentialStoreDegraded, setCredentialStoreDegraded] = useState(false);

  // Dicek sekali saat mount (bukan poll berkala seperti update-check) -- flag ini
  // ditentukan SEKALI oleh main process saat bootstrap() dan tak berubah lagi selama app
  // hidup (restart = kesempatan baru buat sembuh). Sengaja di AgentShell (bukan
  // DashboardScreen) karena gejalanya bisa muncul di layar MANAPUN -- kalau safeStorage
  // gagal, user malah nyangkut di ActivationScreen (loadCredentials() selalu balik
  // EMPTY_BLOB), jadi peringatan ini harus kelihatan sebelum sempat pairing sekalipun
  // (go-public #9).
  useEffect(() => {
    window.agentApi
      .getCredentialStoreStatus()
      .then((s) => setCredentialStoreDegraded(s.degraded))
      .catch((err) => console.error("[agent-shell] gagal cek status penyimpanan kredensial", err));
  }, []);

  return (
    <div className="bg-glass-page min-h-screen flex flex-col items-center justify-center p-6">
      {/* Path RELATIF ("./logo.svg"), bukan absolut ("/logo.svg") — di app terpaket, HTML
          dimuat lewat file:// (window.ts), dan Vite tidak menulis-ulang string literal di
          dalam bundle JS (hanya referensi aset di HTML sendiri yang di-rewrite jadi
          relatif). Path absolut resolve ke root filesystem (file:///logo.svg, tidak ada)
          -> logo jadi broken image di app terpaket meski OK di dev server (final review
          Finding 2). */}
      <img src="./logo.svg" alt="Slizebiz" className="h-8 mb-6" />
      {credentialStoreDegraded && (
        <p role="alert" className="g-error text-[11px] mb-3 max-w-xl text-center">
          Penyimpanan kredensial lokal bermasalah — sebagian pengaturan mungkin tak
          tersimpan, PIN broker akan berubah tiap restart. Coba restart aplikasi; kalau
          berlanjut, hubungi support.
        </p>
      )}
      <GlassCard className={`w-full ${maxWidth} p-6`}>{children}</GlassCard>
      {/* Selama staging versi package.json tak pernah naik tiap rebuild -- ini satu-satunya
          cara user tahu persis build mana yang lagi ke-install (lihat build-info.ts). */}
      <p className="mt-3 text-[10px] g-t4 opacity-60">v{AGENT_BUILD_ID}</p>
    </div>
  );
}
