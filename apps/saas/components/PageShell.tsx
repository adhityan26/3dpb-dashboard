import type { ReactNode } from "react";
import { AppHeader, type NavKey } from "./AppHeader";

/**
 * Kerangka SEMUA halaman ber-auth. Pedoman lengkap: `docs/ui-page-layout.md`.
 *
 * Aturan: `title` WAJIB — judul halaman bagian dari kerangka, bukan tempelan
 * tiap halaman, supaya tak ada lagi halaman yang "menggantung" tanpa judul dan
 * jaraknya seragam. Nav melebar penuh (sticky); container konten lebarnya SELALU
 * sama antar halaman — `narrow` hanya mempersempit KONTEN (mis. checkout).
 */
export function PageShell({
  title,
  description,
  actions,
  current,
  owner = false,
  authenticated = true,
  narrow = false,
  userLabel,
  children,
}: {
  /** Judul halaman (wajib) — tampil sebagai H1 gradient. */
  title: string;
  /** Kalimat singkat di bawah judul. Opsional. */
  description?: string;
  /** Aksi di kanan judul (tombol/link). Opsional. */
  actions?: ReactNode;
  current?: NavKey;
  owner?: boolean;
  authenticated?: boolean;
  narrow?: boolean;
  userLabel?: string;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader authenticated={authenticated} owner={owner} current={current} userLabel={userLabel} />
      <main className="max-w-3xl mx-auto px-6 pt-6 pb-16 relative z-10 page-enter">
        <div className={narrow ? "max-w-md mx-auto" : ""}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold bg-gradient-to-br from-[#1a1a2e] to-indigo-600 dark:from-white dark:to-[#a5b4fc] bg-clip-text text-transparent">
                {title}
              </h1>
              {description && <p className="text-[13px] g-t3 mt-1">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </>
  );
}
