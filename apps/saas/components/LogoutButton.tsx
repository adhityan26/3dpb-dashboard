"use client";
import { signOut } from "next-auth/react";

export function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`text-[12px] g-t4 hover:g-t2 inline-flex items-center gap-1 ${className}`}
    >
      <span aria-hidden>🚪</span> Keluar
    </button>
  );
}
