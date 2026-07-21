import { LogoutButton } from "./LogoutButton";

export type NavKey = "kalkulator" | "setting" | "admin" | "beli";

/** Header bersama semua halaman ber-auth: logo + brand + nav (Kalkulator, Setting, Admin*, Keluar).
 *  Link Admin hanya muncul untuk owner. Halaman yang sedang dibuka tak dilinkkan ke dirinya sendiri. */
export function AppHeader({
  subtitle,
  authenticated = true,
  owner = false,
  current,
}: {
  subtitle?: string;
  authenticated?: boolean;
  owner?: boolean;
  current?: NavKey;
}) {
  const links = [
    { key: "kalkulator" as const, href: "/", icon: "🧮", label: "Kalkulator" },
    { key: "setting" as const, href: "/settings", icon: "⚙", label: "Setting" },
    ...(owner ? [{ key: "admin" as const, href: "/admin", icon: "🛠", label: "Admin" }] : []),
  ].filter((l) => l.key !== current);

  return (
    <header className="flex items-center gap-2 mb-5">
      <a href="/" className="flex items-center gap-2 no-underline">
        <img src="/logo.svg" alt="Slizebiz" width={28} height={28} />
        <span className="font-bold text-lg g-t1">Slizebiz</span>
      </a>
      {subtitle && <span className="text-sm g-t3 hidden sm:inline">· {subtitle}</span>}
      {authenticated && (
        <nav className="ml-auto flex items-center gap-3">
          {links.map((l) => (
            <a key={l.key} href={l.href} className="text-[12px] g-t4 hover:g-t2 inline-flex items-center gap-1">
              <span aria-hidden>{l.icon}</span> {l.label}
            </a>
          ))}
          <LogoutButton />
        </nav>
      )}
    </header>
  );
}
