"use client";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";

/** Tombol keluar gaya control-island dashboard: lingkaran 32px dengan glyph power. */
export function LogoutButton({ className = "" }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Keluar"
      aria-label="Keluar"
      className={`w-[32px] h-[32px] rounded-full flex items-center justify-center text-sm transition-colors hover:bg-red-500/10 ${className}`}
      style={{ color: isDark ? "rgba(255,255,255,0.3)" : "rgba(30,27,75,0.28)" }}
    >
      ⏻
    </button>
  );
}
