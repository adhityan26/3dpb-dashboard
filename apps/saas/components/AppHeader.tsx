"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ThemeToggle } from "./ThemeToggle";
import { LogoutButton } from "./LogoutButton";
import { TABS, type NavKey } from "./nav-tabs";

export type { NavKey };

export function AppHeader({
  authenticated = true,
  owner = false,
  current,
  userLabel,
}: {
  authenticated?: boolean;
  owner?: boolean;
  current?: NavKey;
  userLabel?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Standard hydration-safe "mounted" flag: theme is unknown during SSR, this is the
  // documented way to defer theme-dependent rendering until after the client mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const isDark = !mounted || resolvedTheme !== "light";

  const navStyle = isDark
    ? {
        background: "rgba(6,6,20,0.72)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        borderBottom: "1px solid rgba(99,102,241,0.12)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
      }
    : {
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(28px) saturate(2) brightness(1.02)",
        WebkitBackdropFilter: "blur(28px) saturate(2) brightness(1.02)",
        borderBottom: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "0 4px 24px rgba(99,102,241,0.06), inset 0 -1px 0 rgba(99,102,241,0.06)",
      };

  const islandStyle = isDark
    ? {
        background: "rgba(16,16,52,0.85)",
        border: "1px solid rgba(99,102,241,0.22)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
      }
    : {
        background: "rgba(255,255,255,0.42)",
        border: "1px solid rgba(200,190,255,0.35)",
        boxShadow: "0 4px 24px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.95)",
      };

  const controlStyle = isDark
    ? {
        background: "rgba(16,16,52,0.88)",
        border: "1px solid rgba(99,102,241,0.22)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
      }
    : {
        background: "rgba(255,255,255,0.42)",
        border: "1px solid rgba(200,190,255,0.35)",
        boxShadow: "0 2px 12px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.95)",
      };

  const dividerColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(99,102,241,0.12)";
  const textColor = isDark ? "rgba(255,255,255,0.9)" : "rgba(30,27,75,0.9)";
  const initials = (userLabel ?? "").trim().slice(0, 2).toUpperCase();

  const visible = TABS.filter((t) => !t.ownerOnly || owner);

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-3 px-4 md:px-8 py-[10px]" style={navStyle}>
      <Link href="/" className="flex items-center gap-2 no-underline flex-shrink-0 md:min-w-[150px]">
        <img src="/logo.svg" alt="" width={22} height={22} />
        <span className="font-bold text-[15px]" style={{ color: isDark ? "#a5b4fc" : "#4f46e5" }}>
          Slizebiz
        </span>
      </Link>

      {authenticated && (
        <>
          {/* hidden di mobile (<768px) -- MobileBottomNav (PageShell) sudah jadi nav di sana,
              dulu nav-island ini malah ikut tampil (scroll horizontal) di atas MobileBottomNav
              = tab nav dobel. md:flex = breakpoint SAMA persis dgn MobileBottomNav (md:hidden
              di sisinya), jadi persis satu nav yang tampil di tiap ukuran layar. */}
          <div className="hidden md:flex flex-1 justify-center overflow-x-auto">
            <div className="relative rounded-[48px] flex flex-shrink-0" style={{ ...islandStyle, padding: "8px 10px" }}>
              {visible.map((t) => {
                const active = t.key === current;
                const body = (
                  <span
                    className="flex flex-col items-center justify-center gap-[2px] w-[72px] py-[2px]"
                    style={{
                      transform: active ? "scale(1.12)" : "scale(0.88)",
                      opacity: active ? 1 : t.soon ? 0.35 : 0.5,
                      transition:
                        "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease, color 0.3s ease",
                      color: textColor,
                    }}
                  >
                    <span className="text-[18px] leading-none" aria-hidden>
                      {t.icon}
                    </span>
                    <span className="text-[10px] leading-none whitespace-nowrap">{t.label}</span>
                  </span>
                );
                return t.href && !t.soon ? (
                  <Link key={t.key} href={t.href} className="relative no-underline" aria-current={active ? "page" : undefined}>
                    {body}
                  </Link>
                ) : (
                  <span key={t.key} className="relative cursor-default" aria-disabled="true" title="Segera hadir">
                    {body}
                    <span
                      className="absolute top-[1px] right-[7px] text-[7px] leading-none px-[3px] py-[2px] rounded-full"
                      style={{
                        background: isDark ? "rgba(255,255,255,0.14)" : "rgba(99,102,241,0.14)",
                        color: isDark ? "rgba(255,255,255,0.55)" : "rgba(79,70,229,0.75)",
                      }}
                    >
                      soon
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* ml-auto: dorong ke kanan sendiri di mobile (nav-island di atas hidden -> tak ada
              flex-1 lain yang mendorongnya). Tak berpengaruh di desktop (nav-island yang flex-1
              sudah mendorong duluan). */}
          <div className="flex items-center gap-1 flex-shrink-0 rounded-[28px] p-[5px] ml-auto md:ml-0" style={controlStyle}>
            <ThemeToggle />
            <div className="w-px h-[18px] mx-[2px]" style={{ background: dividerColor }} />
            {initials && (
              <>
                <div
                  className="w-[32px] h-[32px] rounded-full p-[2px] flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #818cf8, #a78bfa)",
                    boxShadow: "0 0 12px rgba(99,102,241,0.5)",
                  }}
                  title={userLabel}
                >
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                    style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
                  >
                    {initials}
                  </div>
                </div>
                <div className="w-px h-[18px] mx-[2px]" style={{ background: dividerColor }} />
              </>
            )}
            <LogoutButton />
          </div>
        </>
      )}
    </nav>
  );
}
