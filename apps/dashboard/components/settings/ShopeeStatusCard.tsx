"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ShopeeStatus } from "@/lib/settings/types"

interface Props {
  status: ShopeeStatus
}

export function ShopeeStatusCard({ status }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🛍️ Koneksi Shopee</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${status.connected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-sm font-medium">
            {status.connected ? "Terhubung" : "Tidak Terhubung"}
          </span>
        </div>
        {status.shopId && (
          <div className="text-xs text-gray-500">Shop ID: {status.shopId}</div>
        )}
        {status.tokenUpdatedAt && (
          <div className="text-xs text-gray-500">
            Token terakhir diperbarui:{" "}
            {new Date(status.tokenUpdatedAt).toLocaleString("id-ID")}
          </div>
        )}
        <a
          href="/api/shopee/auth"
          className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#EE4D2D] hover:bg-[#d44226] text-white text-sm font-medium"
        >
          {status.connected ? "Hubungkan Ulang" : "Hubungkan Shopee"}
        </a>
      </CardContent>
    </Card>
  )
}
