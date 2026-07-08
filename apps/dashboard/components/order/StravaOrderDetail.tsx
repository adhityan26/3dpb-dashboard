"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { StravaOrder, StravaStatus } from "@/lib/strava/types"
import { StatusBadge } from "./StatusBadge"

interface StravaOrderDetailProps {
  order: StravaOrder & {
    resultPhotos?: Array<{
      key: string
      minioUrl: string
      sanityUrl?: string
      expired?: boolean
    }>
  }
  onStatusChange: (status: StravaStatus) => void
  onUploadPhotos: (files: File[]) => Promise<void>
  isUpdating?: boolean
  isUploading?: boolean
}

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

const statusOptions: StravaStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "completed",
  "cancelled",
]

export function StravaOrderDetail({
  order,
  onStatusChange,
  onUploadPhotos,
  isUpdating = false,
  isUploading = false,
}: StravaOrderDetailProps) {
  const [operatorNotes, setOperatorNotes] = useState(order.operatorNotes || "")
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await handleFileUpload(files)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      handleFileUpload(files)
    }
  }

  const handleFileUpload = async (files: File[]) => {
    try {
      // Initialize progress for each file
      files.forEach((file) => {
        setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }))
      })

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const updated = { ...prev }
          Object.keys(updated).forEach((key) => {
            if (updated[key] < 90) {
              updated[key] += Math.random() * 30
            }
          })
          return updated
        })
      }, 200)

      await onUploadPhotos(files)

      clearInterval(progressInterval)
      // Complete progress
      files.forEach((file) => {
        setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }))
      })

      // Clear progress after a moment
      setTimeout(() => {
        setUploadProgress({})
      }, 1000)
    } catch (error) {
      console.error("Upload failed:", error)
      setUploadProgress({})
    }
  }

  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const photos = order.resultPhotos || []

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="font-mono text-lg">#{order.orderId}</CardTitle>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Submitted: {formatDate(order.submittedAt)}
              </div>
            </div>
            <StatusBadge status={order.status} />
          </div>
        </CardHeader>
      </Card>

      {/* Customer Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Name
            </div>
            <div className="text-sm text-slate-900 dark:text-slate-100">
              {order.customerName}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Email
            </div>
            <div className="text-sm text-slate-900 dark:text-slate-100">
              {order.customerEmail}
            </div>
          </div>
          {order.customerPhone && (
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Phone
              </div>
              <div className="text-sm text-slate-900 dark:text-slate-100">
                {order.customerPhone}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items Table Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Order Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-slate-700">
                  <th className="text-left py-2 px-2 font-medium text-xs text-slate-500 dark:text-slate-400">
                    Product
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-xs text-slate-500 dark:text-slate-400">
                    Qty
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-xs text-slate-500 dark:text-slate-400">
                    Unit Price
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-xs text-slate-500 dark:text-slate-400">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => (
                  <tr
                    key={idx}
                    className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-2 px-2">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {item.productName}
                      </div>
                      {item.notes && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {item.notes}
                        </div>
                      )}
                    </td>
                    <td className="text-right py-2 px-2 text-slate-900 dark:text-slate-100">
                      {item.quantity}
                    </td>
                    <td className="text-right py-2 px-2 text-slate-900 dark:text-slate-100">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="text-right py-2 px-2 font-medium text-slate-900 dark:text-slate-100">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 dark:border-slate-600">
                  <td colSpan={3} className="py-2 px-2 text-right font-medium text-slate-900 dark:text-slate-100">
                    Total ({totalItems} items):
                  </td>
                  <td className="text-right py-2 px-2 font-bold text-slate-900 dark:text-slate-100 text-base">
                    {formatCurrency(order.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Status Buttons Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Change Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <Button
                key={status}
                variant={order.status === status ? "default" : "outline"}
                size="sm"
                disabled={isUpdating}
                onClick={() => onStatusChange(status)}
                className="capitalize"
              >
                {status}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Operator Notes Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Operator Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            placeholder="Add notes about this order..."
            disabled={isUpdating}
            className="min-h-24"
          />
        </CardContent>
      </Card>

      {/* Photo Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Result Photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
            }`}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileInputChange}
              disabled={isUploading}
              className="hidden"
              id="photo-input"
            />
            <label
              htmlFor="photo-input"
              className={`block cursor-pointer ${isUploading ? "opacity-50" : ""}`}
            >
              <div className="text-2xl mb-2">📸</div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {isDragging ? "Drop files here" : "Drag photos here or click to select"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                PNG, JPG, GIF up to 10MB each
              </div>
            </label>
          </div>

          {/* Upload Progress */}
          {Object.entries(uploadProgress).length > 0 && (
            <div className="space-y-2">
              {Object.entries(uploadProgress).map(([name, progress]) => (
                <div key={name}>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    {name}
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-200"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Photo Gallery */}
          {photos.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                {photos.length} photo{photos.length !== 1 ? "s" : ""} uploaded
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div
                    key={photo.key}
                    className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800"
                  >
                    <img
                      src={photo.sanityUrl || photo.minioUrl}
                      alt={photo.key}
                      className="w-full h-full object-cover"
                    />
                    {photo.expired && (
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <span className="text-xs font-medium text-white bg-red-500 px-2 py-1 rounded">
                          Expired
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
