"use client"

import Link from "next/link"
import { useGopayStatus } from "@/lib/hooks/use-gopay"

export function GopayTab() {
  const { data: status, isLoading } = useGopayStatus()

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <div
          className={`h-2.5 w-2.5 rounded-full ${
            isLoading ? "bg-gray-400" : status?.connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-sm font-medium">
          {isLoading ? "Memeriksa…" : status?.connected ? "Terhubung" : "Tidak Terhubung"}
        </span>
      </div>

      {status?.message && (
        <div className="text-xs text-gray-500">{status.message}</div>
      )}

      {!status?.connected && !isLoading && (
        <div className="text-sm text-gray-500 dark:text-slate-400">
          Belum terhubung ke GoPay. Sambungkan lewat{" "}
          <Link href="/settings?tab=lainnya" className="text-indigo-600 dark:text-indigo-400 underline">
            Settings → Koneksi GoPay
          </Link>
          .
        </div>
      )}
    </div>
  )
}
