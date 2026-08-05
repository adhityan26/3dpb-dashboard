"use client"

import { useMemo, useState } from "react"
import { PageShell } from "@/components/layout/PageShell"
import { BulkShippingOrderList } from "@/components/order/BulkShippingOrderList"
import { useOrders } from "@/lib/hooks/use-orders"
import type { OrderSummary } from "@/lib/orders/types"

type Method = "pickup" | "dropoff"
type ShipResult = { orderSn: string; success: boolean; error?: string }
type Branch = { branchId: number; address: string }

export default function PengirimanPage() {
  const { data, isLoading } = useOrders()
  const [selectedSns, setSelectedSns] = useState<Set<string>>(new Set())
  const [method, setMethod] = useState<Method | null>(null)
  const [shipResults, setShipResults] = useState<ShipResult[] | null>(null)
  const [isShipping, setIsShipping] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [shipError, setShipError] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [branchError, setBranchError] = useState<string | null>(null)
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null)

  const readyOrders = useMemo<OrderSummary[]>(
    () => (data?.orders ?? []).filter((o: OrderSummary) => o.shopeeStatus === "READY_TO_SHIP"),
    [data],
  )

  function toggleSelect(orderSn: string) {
    setSelectedSns((prev) => {
      const next = new Set(prev)
      next.has(orderSn) ? next.delete(orderSn) : next.add(orderSn)
      return next
    })
    setShipResults(null)
  }

  function toggleSelectAll() {
    setSelectedSns((prev) =>
      prev.size === readyOrders.length ? new Set() : new Set(readyOrders.map((o) => o.orderSn)),
    )
    setShipResults(null)
  }

  async function handleSelectMethod(next: Method) {
    setMethod(next)
    if (next !== "dropoff") return

    setSelectedBranchId(null)
    setBranches(null)
    setBranchError(null)
    setIsLoadingBranches(true)
    try {
      const firstSn = Array.from(selectedSns)[0]
      if (!firstSn) {
        setBranchError("Pilih minimal satu order dulu untuk memuat daftar cabang")
        return
      }
      const res = await fetch(`/api/shopee/logistics/parameter?orderSn=${encodeURIComponent(firstSn)}`)
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setBranchError(json?.error ?? "Gagal memuat daftar cabang drop-off")
        return
      }
      const json = await res.json()
      const branchList: Branch[] = json?.dropoff?.branchList ?? []
      if (branchList.length === 0) {
        setBranchError("Tidak ada cabang drop-off tersedia untuk order ini")
        return
      }
      setBranches(branchList)
    } catch {
      setBranchError("Gagal memuat daftar cabang — periksa koneksi Anda")
    } finally {
      setIsLoadingBranches(false)
    }
  }

  async function handleArrangeShipment() {
    if (!method || selectedSns.size === 0) return
    if (method === "dropoff" && selectedBranchId == null) return
    setIsShipping(true)
    setShipResults(null)
    setShipError(null)
    try {
      // v1: pickup auto-picks the first available address/time slot per order via
      // getShippingParameter server-side — the ship route resolves that itself, so
      // the client just sends { kind: "pickup" } with no addressId/timeSlotId.
      // Dropoff requires a branchId, chosen up front from the branch picker below.
      const requestedMethod =
        method === "dropoff" ? { kind: "dropoff" as const, branchId: selectedBranchId! } : { kind: "pickup" as const }
      const res = await fetch("/api/shopee/logistics/ship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: Array.from(selectedSns).map((orderSn) => ({ orderSn, method: requestedMethod })),
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setShipError(json?.error ?? "Gagal mengatur pengiriman")
        return
      }
      const json = await res.json()
      setShipResults(json.results)
    } catch {
      setShipError("Gagal mengatur pengiriman — periksa koneksi Anda")
    } finally {
      setIsShipping(false)
    }
  }

  async function handleGenerateResi() {
    const successfulSns = (shipResults ?? []).filter((r) => r.success).map((r) => r.orderSn)
    if (successfulSns.length === 0) return
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch("/api/shopee/logistics/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderSnList: successfulSns }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setGenerateError(json?.error ?? "Gagal generate resi")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
    } catch {
      setGenerateError("Gagal generate resi — periksa koneksi Anda")
    } finally {
      setIsGenerating(false)
    }
  }

  const successCount = (shipResults ?? []).filter((r) => r.success).length
  const failCount = (shipResults ?? []).filter((r) => !r.success).length

  return (
    <PageShell title="Pengiriman Massal" description="Pilih order, atur pengiriman, lalu cetak resi sekaligus.">
      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Memuat order...</div>
      ) : (
        <>
          <BulkShippingOrderList
            orders={readyOrders}
            selectedSns={selectedSns}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />

          <div className="mt-4 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/25">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Langkah 1 — Atur Pengiriman ({selectedSns.size} dipilih)
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => handleSelectMethod("pickup")}
                className={method === "pickup" ? "font-bold" : ""}
              >
                📦 Pickup (dijemput kurir)
              </button>
              <button
                type="button"
                onClick={() => handleSelectMethod("dropoff")}
                className={method === "dropoff" ? "font-bold" : ""}
              >
                🏬 Drop-off ke Counter
              </button>
            </div>
            {method === "dropoff" && (
              <div className="mt-2">
                {isLoadingBranches && <div className="text-xs text-gray-400">Memuat daftar cabang...</div>}
                {branchError && <div className="text-xs text-red-400">{branchError}</div>}
                {branches && branches.length > 0 && (
                  <select
                    aria-label="Pilih cabang drop-off"
                    value={selectedBranchId ?? ""}
                    onChange={(e) => setSelectedBranchId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full mt-1"
                  >
                    <option value="">Pilih cabang...</option>
                    {branches.map((b) => (
                      <option key={b.branchId} value={b.branchId}>
                        {b.address}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleArrangeShipment}
              disabled={
                !method ||
                selectedSns.size === 0 ||
                isShipping ||
                (method === "dropoff" && selectedBranchId == null)
              }
              className="mt-3 w-full"
            >
              {isShipping ? "Mengatur..." : `Atur Pengiriman (${selectedSns.size} order)`}
            </button>
            {shipError && <div className="text-xs text-red-400 mt-2">{shipError}</div>}
          </div>

          {shipResults && (
            <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
              <div className="text-xs uppercase tracking-wide text-gray-400">Langkah 2 — Hasil</div>
              <div className="text-sm mt-1">
                {successCount} order berhasil diatur
                {failCount > 0 ? ` — ${failCount} gagal` : ""}
              </div>
              {failCount > 0 && (
                <ul className="text-xs text-red-400 mt-1 list-disc list-inside">
                  {shipResults.filter((r) => !r.success).map((r) => (
                    <li key={r.orderSn}>{r.orderSn}: {r.error}</li>
                  ))}
                </ul>
              )}
              {successCount > 0 && (
                <button type="button" onClick={handleGenerateResi} disabled={isGenerating} className="mt-3 w-full">
                  {isGenerating ? "Membuat resi..." : `Generate & Cetak Resi (${successCount} order)`}
                </button>
              )}
              {generateError && <div className="text-xs text-red-400 mt-2">{generateError}</div>}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
