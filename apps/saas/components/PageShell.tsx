import type { ReactNode } from "react";
import { AppHeader, type NavKey } from "./AppHeader";

/** Kerangka halaman bersama: container + header identik di semua halaman.
 *  Lebar container SELALU sama supaya header tak geser saat pindah halaman;
 *  konten yang memang harus sempit (mis. checkout) pakai `narrow`. */
export function PageShell({
  subtitle,
  current,
  owner = false,
  authenticated = true,
  narrow = false,
  children,
}: {
  subtitle?: string;
  current?: NavKey;
  owner?: boolean;
  authenticated?: boolean;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <AppHeader subtitle={subtitle} authenticated={authenticated} owner={owner} current={current} />
      <div className={narrow ? "max-w-md mx-auto" : ""}>{children}</div>
    </main>
  );
}
