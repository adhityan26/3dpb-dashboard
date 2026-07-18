"use client";
import { signOut } from "next-auth/react";

export function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`text-[12px] g-t4 underline hover:g-t2 ${className}`}
    >
      Keluar
    </button>
  );
}
