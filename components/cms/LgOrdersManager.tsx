"use client"

import Link from "next/link"
import { useState } from "react"
import { RefreshCw, X } from "lucide-react"
import { useSanityOrders, useConfirmLgOrder, useSyncSanityOrder } from "@/lib/hooks/use-light-generator"
import { CollectionList } from "./shared/CollectionList"
import type { SanityLgOrderWithConfirmed } from "@/lib/light-generator/types"
import { sanityImageUrl } from "@/lib/sanity/image-url"

function ImageZoomModal({ src, orderId, onClose }: { src: string; orderId: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 flex items-center justify-center w-7 h-7 rounded-full transition-opacity hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <X className="w-4 h-4 text-white" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={orderId}
          className="w-full h-auto rounded-lg"
          style={{ maxHeight: "80vh", objectFit: "contain" }}
        />
        <p className="text-center text-[11px] mt-2 font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
          {orderId}
        </p>
      </div>
    </div>
  )
}

function ReloadConfirmDialog({
  orderId,
  onConfirm,
  onCancel,
}: {
  orderId: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl p-6 w-full max-w-sm space-y-4"
        style={{ background: "rgba(30,27,60,0.98)", border: "1px solid rgba(99,102,241,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <RefreshCw className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#a5b4fc" }} />
          <div>
            <p className="text-[13px] font-semibold text-white">Reload dari Sanity?</p>
            <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              Data customer, config awal, dan gambar akan diperbarui dari Sanity.
            </p>
            <p className="text-[11px] mt-2 font-mono" style={{ color: "rgba(165,180,252,0.6)" }}>
              {orderId}
            </p>
            <p className="text-[10px] mt-2 px-2 py-1 rounded" style={{ background: "rgba(234,179,8,0.12)", color: "#fbbf24" }}>
              ⚠️ Status &amp; operator config tidak akan berubah
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="text-[11px] px-3 py-1.5 rounded-[6px] transition-opacity hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-[6px] transition-opacity hover:opacity-80 flex items-center gap-1.5"
            style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}
          >
            <RefreshCw className="w-3 h-3" />
            Ya, reload
          </button>
        </div>
      </div>
    </div>
  )
}

export function LgOrdersManager() {
  const { data: items = [], isLoading } = useSanityOrders()
  const confirm = useConfirmLgOrder()
  const syncSanity = useSyncSanityOrder()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [reloading, setReloading] = useState<string | null>(null)
  const [reloadTarget, setReloadTarget] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [zoomImage, setZoomImage] = useState<{ src: string; orderId: string } | null>(null)

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const pendingCount = items.filter((i) => !i.isConfirmed).length

  function handleConfirm(orderId: string) {
    setConfirming(orderId)
    setFeedback((f) => ({ ...f, [orderId]: "" }))
    confirm.mutate(orderId, {
      onSuccess: () => {
        setConfirming(null)
      },
      onError: (err) => {
        setFeedback((f) => ({ ...f, [orderId]: `❌ ${err.message}` }))
        setConfirming(null)
      },
    })
  }

  function handleReloadConfirmed(orderId: string) {
    setReloadTarget(orderId)
  }

  function handleReloadExecute() {
    if (!reloadTarget) return
    const orderId = reloadTarget
    setReloadTarget(null)
    setReloading(orderId)
    setFeedback((f) => ({ ...f, [orderId]: "" }))
    syncSanity.mutate(orderId, {
      onSuccess: () => {
        setReloading(null)
        setFeedback((f) => ({ ...f, [orderId]: "✅ Synced" }))
        setTimeout(() => setFeedback((f) => ({ ...f, [orderId]: "" })), 3000)
      },
      onError: (err) => {
        setReloading(null)
        setFeedback((f) => ({ ...f, [orderId]: `❌ ${err.message}` }))
      },
    })
  }

  return (
    <>
      {zoomImage && (
        <ImageZoomModal
          src={zoomImage.src}
          orderId={zoomImage.orderId}
          onClose={() => setZoomImage(null)}
        />
      )}

      {reloadTarget && (
        <ReloadConfirmDialog
          orderId={reloadTarget}
          onConfirm={handleReloadExecute}
          onCancel={() => setReloadTarget(null)}
        />
      )}

      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-white">🔦 Light Generator Orders</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              {items.length} total{pendingCount > 0 ? ` · ${pendingCount} menunggu konfirmasi` : " · semua terkonfirmasi"}
            </p>
          </div>
          <Link
            href="/light-generator"
            className="text-[11px] font-medium transition-opacity hover:opacity-80"
            style={{ color: "rgba(165,180,252,0.8)" }}
          >
            Lihat semua →
          </Link>
        </div>

        <CollectionList
          items={items}
          emptyMessage="Tidak ada order dari landing page."
          columns={[
            {
              key: "image",
              label: "",
              width: "52px",
              render: (item: SanityLgOrderWithConfirmed) => {
                if (!item.silhouetteImage?.asset?._ref) {
                  return <div className="w-10 h-10 rounded bg-white/5" />
                }
                const thumbSrc = sanityImageUrl(item.silhouetteImage.asset._ref, 80)
                const fullSrc = sanityImageUrl(item.silhouetteImage.asset._ref, 800)
                return (
                  <button
                    type="button"
                    onClick={() => setZoomImage({ src: fullSrc, orderId: item.orderId })}
                    className="block w-10 h-10 rounded overflow-hidden transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbSrc}
                      alt={item.orderId}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover bg-white/5"
                    />
                  </button>
                )
              },
            },
            {
              key: "id",
              label: "Order ID",
              width: "160px",
              render: (item: SanityLgOrderWithConfirmed) => (
                <span className="text-[11px] font-mono text-white/70">{item.orderId}</span>
              ),
            },
            {
              key: "customer",
              label: "Pelanggan",
              width: "160px",
              render: (item: SanityLgOrderWithConfirmed) => (
                <div>
                  <div className="text-[12px] text-white/80">{item.customerName}</div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {item.customerContact}
                  </div>
                </div>
              ),
            },
            {
              key: "config",
              label: "Config",
              render: (item: SanityLgOrderWithConfirmed) => (
                <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {item.size} · {item.shape}
                </div>
              ),
            },
            {
              key: "date",
              label: "Tanggal",
              width: "90px",
              render: (item: SanityLgOrderWithConfirmed) => (
                <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {new Date(item.submittedAt).toLocaleDateString("id-ID")}
                </div>
              ),
            },
            {
              key: "action",
              label: "",
              width: "170px",
              render: (item: SanityLgOrderWithConfirmed) => {
                const fb = feedback[item.orderId]
                const isReloading = reloading === item.orderId

                if (fb && !isReloading) {
                  return <span className="text-[10px]">{fb}</span>
                }

                if (item.isConfirmed) {
                  return (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full"
                        style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                      >
                        ✅ Confirmed
                      </span>
                      <button
                        onClick={() => handleReloadConfirmed(item.orderId)}
                        disabled={isReloading}
                        title="Reload dari Sanity"
                        className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc" }}
                      >
                        <RefreshCw className={`w-3 h-3 ${isReloading ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  )
                }

                return (
                  <button
                    onClick={() => handleConfirm(item.orderId)}
                    disabled={confirming === item.orderId}
                    className="text-[11px] font-semibold px-3 py-1 rounded-[6px] transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: "rgba(99,102,241,0.25)", color: "#a5b4fc" }}
                  >
                    {confirming === item.orderId ? "..." : "Confirm"}
                  </button>
                )
              },
            },
          ]}
        />
      </div>
    </>
  )
}
