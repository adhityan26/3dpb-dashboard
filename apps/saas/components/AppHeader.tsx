import { LogoutButton } from "./LogoutButton";

/** Header bersama semua halaman ber-auth: logo + brand + nav (Setting, Keluar). */
export function AppHeader({ subtitle, authenticated = true }: { subtitle?: string; authenticated?: boolean }) {
  return (
    <header className="flex items-center gap-2 mb-5">
      <a href="/" className="flex items-center gap-2 no-underline">
        <img src="/logo.svg" alt="Slizebiz" width={28} height={28} />
        <span className="font-bold text-lg g-t1">Slizebiz</span>
      </a>
      {subtitle && <span className="text-sm g-t3 hidden sm:inline">· {subtitle}</span>}
      {authenticated && (
        <nav className="ml-auto flex items-center gap-3">
          <a href="/settings" className="text-[12px] g-t4 hover:g-t2 inline-flex items-center gap-1" title="Setting kalkulator">
            <span aria-hidden>⚙</span> Setting
          </a>
          <LogoutButton />
        </nav>
      )}
    </header>
  );
}
