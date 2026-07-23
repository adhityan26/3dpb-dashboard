"use client"

import { useRef, useState } from "react"

interface ImageUploadProps {
  currentUrl?: string | null
  label?: string
  onUpload: (result: { assetRef: string; url: string }) => void
}

export function ImageUpload({ currentUrl, label = "Gambar", onUpload }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/cms/assets/upload", { method: "POST", body: formData })
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload gagal")
      const { assetRef, url } = await res.json()
      onUpload({ assetRef, url })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload gagal")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>
        {label}
      </label>
      <div
        className="flex items-center gap-3 p-3 rounded-[5px] border border-dashed cursor-pointer"
        style={{ borderColor: "rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.05)" }}
        onClick={() => inputRef.current?.click()}
      >
        {currentUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${currentUrl}?w=80&h=80&fit=crop`} alt="" className="w-[60px] h-[60px] rounded-[5px] object-cover flex-shrink-0" />
        )}
        <div>
          <div className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            {uploading ? "Uploading..." : "Klik untuk pilih gambar"}
          </div>
          {error && <div className="text-[11px] text-red-400 mt-1">{error}</div>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}
