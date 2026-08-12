"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useGopayStatus } from "@/lib/hooks/use-gopay"
import { GopayConnectModal } from "@/components/gopay/GopayConnectModal"

export function GopayStatusCard() {
  const { data: status, isLoading } = useGopayStatus()
  const [modalOpen, setModalOpen] = useState(false)
  const qc = useQueryClient()

  function handleConnected() {
    qc.invalidateQueries({ queryKey: ["gopay", "status"] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">💳 Koneksi GoPay</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
        >
          {status?.connected ? "Hubungkan Ulang" : "Hubungkan GoPay"}
        </button>
      </CardContent>

      {modalOpen && (
        <GopayConnectModal
          onClose={() => setModalOpen(false)}
          onConnected={handleConnected}
        />
      )}
    </Card>
  )
}
