"use client"

import { useEffect, useRef, useState } from "react"
import { Upload, X } from "lucide-react"
import type { WizardState } from "./ShopeeCreateWizard"

interface Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
  katalogImageUrl: string | null
}

export function StepMedia({ state, update, katalogImageUrl }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const autoImportDone = useRef(false)

  // Auto-import katalog image on first mount if no images yet
  useEffect(() => {
    if (autoImportDone.current) return
    if (!katalogImageUrl || state.images.length > 0) return
    autoImportDone.current = true

    async function importKatalogImage() {
      setUploading(true)
      try {
        const res = await fetch(katalogImageUrl!)
        if (!res.ok) return
        const blob = await res.blob()
        const file = new File([blob], "katalog-image.jpg", { type: blob.type || "image/jpeg" })
        await uploadFile(file)
      } catch {
        // silently skip if katalog image import fails
      } finally {
        setUploading(false)
      }
    }
    importKatalogImage()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFile(file: File) {
    const fd = new FormData()
    fd.append("image", file)
    setUploading(true)
    setUploadError(null)
    try {
      const res = await fetch("/api/shopee/upload-image", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      update({ images: [...state.images, { imageId: json.imageId, imageUrl: json.imageUrl }] })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload gagal")
    } finally {
      setUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ""
  }

  function removeImage(index: number) {
    update({ images: state.images.filter((_, i) => i !== index) })
  }

  const canAddMore = state.images.length < 9 && !uploading

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Foto Produk <span style={{ color: "#f87171" }}>*</span>
          <span className="ml-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
            {state.images.length}/9
          </span>
        </label>

        <div className="grid grid-cols-3 gap-3">
          {state.images.map((img, idx) => (
            <div key={img.imageId} className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.imageUrl}
                alt={`Image ${idx + 1}`}
                className="w-full h-full object-cover rounded-[5px]"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.8)" }}
                aria-label={`Hapus foto ${idx + 1}`}
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}

          {canAddMore && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-[5px] flex flex-col items-center justify-center gap-1 transition-opacity hover:opacity-70"
              style={{
                border: "1px dashed rgba(99,102,241,0.3)",
                background: "rgba(99,102,241,0.05)",
                color: "rgba(165,180,252,0.5)",
              }}
              aria-label="Upload foto"
            >
              <Upload className="w-5 h-5" />
              <span className="text-[10px]">Upload</span>
            </button>
          )}

          {uploading && (
            <div
              className="aspect-square rounded-[5px] flex items-center justify-center"
              style={{ border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)" }}
            >
              <span className="text-[10px] animate-pulse" style={{ color: "rgba(255,255,255,0.3)" }}>
                Uploading...
              </span>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {uploadError && (
          <div className="text-[10px] mt-2 px-3 py-1.5 rounded-[5px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
            ❌ {uploadError}
          </div>
        )}

        <div className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>
          Format: JPG, PNG, WebP · Maks 9 gambar · Gambar dari katalog otomatis di-import
        </div>
      </div>
    </div>
  )
}
