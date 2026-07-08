"use client"

import { useEffect } from "react"

interface ImageZoomModalProps {
  src: string
  alt?: string
  onClose: () => void
}

export function ImageZoomModal({ src, alt = "", onClose }: ImageZoomModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] rounded-[12px] object-contain shadow-2xl"
          style={{ boxShadow: "0 0 60px rgba(0,0,0,0.6)" }}
        />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center text-white text-[14px] font-bold transition-opacity hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)" }}
        >
          ✕
        </button>
        {alt && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] text-white/70" style={{ background: "rgba(0,0,0,0.5)" }}>
            {alt}
          </div>
        )}
      </div>
    </div>
  )
}
