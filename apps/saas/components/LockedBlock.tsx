"use client";
import type { ReactNode } from "react";

export function LockedBlock({ locked, children }: { locked: boolean; children: ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div className="locked-blur">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
        <div>
          <p className="text-[12px] g-t2 mb-2">Banding margin Kompetitif/Standard/Premium, cek untung/rugi vs harga pasar & harga per channel</p>
          <a
            href="/login"
            className="g-btn-ghost rounded-[10px] px-4 h-9 inline-flex items-center text-sm font-medium"
            style={{ background: "var(--g-accent)", color: "#fff", border: "none" }}
          >
            Login gratis untuk buka
          </a>
          <p className="text-[11px] g-t4 mt-1">tanpa password · link masuk via email</p>
        </div>
      </div>
    </div>
  );
}
