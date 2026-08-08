"use client";
import { useEffect, useState } from "react";

type Os = "win" | "mac";

function detectOs(): Os {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  // iPhone/iPad turut dihitung "mac" -- kalaupun jarang buka Settings dari situ, tebakan yang
  // masuk akal saat User-Agent tak jelas tetap lebih baik daripada default Windows buta.
  return /Mac|iPhone|iPad|iPod/i.test(ua) ? "mac" : "win";
}

const OS_META: Record<Os, { label: string; href: string; icon: React.ReactNode }> = {
  win: {
    label: "Windows",
    href: "/api/agent/binary/win",
    icon: (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        <rect x="0" y="0" width="7" height="7" />
        <rect x="9" y="0" width="7" height="7" />
        <rect x="0" y="9" width="7" height="7" />
        <rect x="9" y="9" width="7" height="7" />
      </svg>
    ),
  },
  mac: {
    label: "macOS",
    href: "/api/agent/binary/mac",
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.014-.11-.04-.264-.04-.44 0-1.15.58-2.35 1.23-3.06.795-.86 2.18-1.53 3.24-1.55.03.13.04.28.04.43zm4.565 15.71c-.03.07-.463 1.61-1.535 3.19-.925 1.37-1.885 2.75-3.4 2.78-1.49.03-1.97-.89-3.67-.89-1.7 0-2.23.87-3.64.92-1.46.05-2.58-1.48-3.51-2.85-1.9-2.79-3.36-7.88-1.4-11.31.97-1.7 2.71-2.79 4.6-2.82 1.44-.03 2.79.98 3.67.98.87 0 2.51-1.2 4.23-1.03.72.03 2.74.29 4.04 2.19-.1.07-2.41 1.41-2.39 4.2.03 3.36 2.95 4.48 2.99 4.5z" />
      </svg>
    ),
  },
};

/**
 * "use client" wajib -- deteksi OS pakai navigator.userAgent (cuma ada di browser). Default
 * state "win" dipakai server-side & render pertama client (sama, jadi tak ada hydration
 * mismatch) -- dikoreksi via useEffect abis mount, tombol utama disembunyikan (visibility,
 * bukan unmount -- hindari layout shift) sampai deteksi selesai biar user tak lihat OS salah
 * berkedip sekejap.
 *
 * Sengaja "latest only", tak ada histori versi/pilihan admin (lihat percakapan brainstorm) --
 * admin overwrite manual key R2 tiap ada build baru.
 */
export function DownloadAgentSection() {
  const [mounted, setMounted] = useState(false);
  const [detected, setDetected] = useState<Os>("win");
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    setDetected(detectOs());
    setMounted(true);
  }, []);

  const primary = OS_META[detected];
  const otherOs: Os = detected === "win" ? "mac" : "win";
  const secondary = OS_META[otherOs];

  return (
    <div className="g-card p-4">
      <h3 className="text-[14px] font-semibold mb-2">Download Slizebiz Agent</h3>
      <p className="text-[12px] g-t4 mb-3">
        Aplikasi desktop buat pasangkan &amp; monitor printer -- perlu token di atas buat aktivasi.
      </p>

      <a
        href={primary.href}
        className="flex items-center justify-center gap-2 text-[13px] font-medium px-4 py-2.5 rounded-md w-full"
        style={{ background: "var(--g-accent)", color: "#fff", visibility: mounted ? "visible" : "hidden" }}
      >
        {primary.icon}
        Download untuk {primary.label}
      </a>

      <button type="button" onClick={() => setShowOther((v) => !v)} className="text-[11px] g-t4 underline mt-2">
        {showOther ? "Sembunyikan" : `Pakai ${secondary.label}?`}
      </button>

      {showOther && (
        <a
          href={secondary.href}
          className="flex items-center justify-center gap-2 text-[12px] px-3 py-1.5 rounded-md g-btn-ghost mt-2"
        >
          {secondary.icon}
          {secondary.label}
        </a>
      )}
    </div>
  );
}
