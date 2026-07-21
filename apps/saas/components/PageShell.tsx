import type { ReactNode } from "react";
import { AppHeader, type NavKey } from "./AppHeader";

/** Kerangka halaman bersama: nav island melebar penuh (sticky) + container konten
 *  yang lebarnya SELALU sama di semua halaman. Konten yang memang sempit
 *  (mis. checkout) pakai `narrow` — mempersempit konten, bukan navnya. */
export function PageShell({
  subtitle,
  current,
  owner = false,
  authenticated = true,
  narrow = false,
  userLabel,
  children,
}: {
  subtitle?: string;
  current?: NavKey;
  owner?: boolean;
  authenticated?: boolean;
  narrow?: boolean;
  userLabel?: string;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader
        subtitle={subtitle}
        authenticated={authenticated}
        owner={owner}
        current={current}
        userLabel={userLabel}
      />
      <main className="max-w-3xl mx-auto p-6 relative z-10">
        <div className={narrow ? "max-w-md mx-auto" : ""}>{children}</div>
      </main>
    </>
  );
}
