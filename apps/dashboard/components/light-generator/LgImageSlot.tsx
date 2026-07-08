"use client"

import { useRef, useState } from "react"
import { Download, Upload, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLgOrder } from "@/lib/hooks/use-light-generator"

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp"
const MAX_BYTES = 10 * 1024 * 1024

interface LgImageSlotProps {
  orderId: string
  label: string
  type: "silhouette" | "additional"
  hasImage: boolean
}

export function LgImageSlot({ orderId, label, type, hasImage: initialHasImage }: LgImageSlotProps) {
  const { refetch } = useLgOrder(orderId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasImage, setHasImage] = useState(initialHasImage)

  const endpoint = type === "silhouette" ? "silhouette" : "additional"
  const apiUrl = `/api/light-generator/orders/${orderId}/${endpoint}`

  // Bust cache so Next.js doesn't serve old presigned-redirect
  const [cacheBust, setCacheBust] = useState(0)
  const displayUrl = previewUrl ?? (hasImage ? `${apiUrl}?v=${cacheBust}` : null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) { setError("File terlalu besar (max 10 MB)"); return }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setError(null)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    e.target.value = ""
  }

  function handleCancel() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setSelectedFile(null)
    setError(null)
  }

  async function handleSave() {
    if (!selectedFile) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      const res = await fetch(apiUrl, { method: "PUT", body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? "Upload gagal")
        return
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setSelectedFile(null)
      setHasImage(true)
      setCacheBust((n) => n + 1)
      refetch()
    } catch (err) {
      setError(String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>

      <div className="border rounded-md overflow-hidden bg-muted aspect-square w-full flex items-center justify-center">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt={label} className="object-contain w-full h-full" />
        ) : (
          <p className="text-xs text-muted-foreground">No image</p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {hasImage && !selectedFile && (
          <a href={apiUrl} download>
            <Button variant="outline" size="sm">
              <Download className="size-3.5 mr-1" />
              Download
            </Button>
          </a>
        )}

        {!selectedFile ? (
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="size-3.5 mr-1" />
            {hasImage ? "Replace" : "Add Image"}
          </Button>
        ) : (
          <>
            <Button size="sm" disabled={uploading} onClick={handleSave}>
              {uploading
                ? <Loader2 className="size-3.5 mr-1 animate-spin" />
                : <Upload className="size-3.5 mr-1" />}
              Save
            </Button>
            <Button variant="outline" size="sm" disabled={uploading} onClick={handleCancel}>
              <X className="size-3.5 mr-1" />
              Cancel
            </Button>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
