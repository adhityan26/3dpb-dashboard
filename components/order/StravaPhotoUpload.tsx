"use client"

import { useRef, useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

interface StravaPhotoUploadProps {
  orderId: string
  onUpload: (files: File[]) => Promise<void>
  isUploading?: boolean
}

export function StravaPhotoUpload({
  orderId,
  onUpload,
  isUploading = false,
}: StravaPhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/")
    )

    if (files.length > 0) {
      await onUpload(files)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || [])
    if (files.length > 0) {
      await onUpload(files)
    }
  }

  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`
        relative rounded-lg border-2 border-dashed p-8 text-center transition-colors
        ${
          isDragActive
            ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
            : "border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20"
        }
        ${isUploading ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500"}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        disabled={isUploading}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-3">
        <Upload
          className={`h-8 w-8 transition-colors ${
            isDragActive
              ? "text-indigo-600 dark:text-indigo-400"
              : "text-slate-400 dark:text-slate-500"
          }`}
        />

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {isDragActive ? "Drop photos here" : "Drag photos here or click to upload"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            PNG, JPG, GIF up to 10MB each
          </p>
        </div>

        <Button
          onClick={handleClick}
          disabled={isUploading}
          size="sm"
          className="mt-2"
        >
          {isUploading ? "Uploading..." : "Choose Photos"}
        </Button>
      </div>

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Uploading...
          </div>
        </div>
      )}
    </div>
  )
}
