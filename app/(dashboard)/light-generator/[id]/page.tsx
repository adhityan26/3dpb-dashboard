"use client"

import { use, useState } from "react"
import { useLgOrder, useUpdateLgOrder, useGenerateLgStl, useUploadLgFile } from "@/lib/hooks/use-light-generator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { LgConfigJson } from "@/lib/light-generator/types"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

const STATUSES = ["submitted", "paid", "generating", "ready", "shipped", "cancelled"]

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-gray-500",
  paid:       "bg-blue-500",
  generating: "bg-yellow-500 animate-pulse",
  ready:      "bg-green-500",
  shipped:    "bg-purple-500",
  cancelled:  "bg-red-500",
}

export default function LgOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: order, isLoading } = useLgOrder(id)
  const updateOrder = useUpdateLgOrder(id)
  const generateStl = useGenerateLgStl(id)
  const uploadSilhouette = useUploadLgFile(id, "silhouette")
  const uploadAdditional = useUploadLgFile(id, "additional")

  const [statusDraft, setStatusDraft] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [notesOperator, setNotesOperator] = useState<string | null>(null)
  const [configOverride, setConfigOverride] = useState<string | null>(null)
  const [configEditing, setConfigEditing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Memuat...</div>
  if (!order) return <div className="py-12 text-center text-muted-foreground">Order tidak ditemukan</div>

  const effectiveStatus = statusDraft ?? order.status
  const effectiveStatusNote = statusNote ?? order.statusNote ?? ""
  const effectiveNotesOperator = notesOperator ?? order.notesOperator ?? ""
  const effectiveConfig = configOverride ?? order.configJsonOperator ?? order.configJson
  const parsedConfig: LgConfigJson = JSON.parse(order.configJsonOperator ?? order.configJson)

  function handleSaveStatus() {
    setFeedback(null)
    const data: Record<string, unknown> = {}
    if (statusDraft !== null) data.status = statusDraft
    if (statusNote !== null) data.statusNote = statusNote
    if (notesOperator !== null) data.notesOperator = notesOperator
    updateOrder.mutate(data, {
      onSuccess: () => {
        setFeedback("✅ Tersimpan")
        setStatusDraft(null)
        setStatusNote(null)
        setNotesOperator(null)
      },
      onError: (err) => setFeedback(`❌ ${err.message}`),
    })
  }

  function handleSaveConfig() {
    setFeedback(null)
    try {
      JSON.parse(effectiveConfig) // validate JSON
    } catch {
      setFeedback("❌ JSON tidak valid")
      return
    }
    updateOrder.mutate({ configJsonOperator: effectiveConfig }, {
      onSuccess: () => {
        setFeedback("✅ Config tersimpan")
        setConfigOverride(null)
        setConfigEditing(false)
      },
      onError: (err) => setFeedback(`❌ ${err.message}`),
    })
  }

  function handleGenerate() {
    setFeedback(null)
    generateStl.mutate(undefined, {
      onSuccess: (r) => setFeedback(`✅ STL generated (${(r.stlSize / 1024).toFixed(1)} KB)`),
      onError: (err) => setFeedback(`❌ ${err.message}`),
    })
  }

  function handleFileUpload(field: "silhouette" | "additional", e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const mut = field === "silhouette" ? uploadSilhouette : uploadAdditional
    mut.mutate(file, {
      onSuccess: () => setFeedback(`✅ ${field === "silhouette" ? "Silhouette" : "Floor insert"} uploaded`),
      onError: (err) => setFeedback(`❌ ${err.message}`),
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold font-mono">{order.id}</h1>
        <span className={`inline-block px-2 py-0.5 rounded text-white text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-gray-500"}`}>
          {order.status}
        </span>
      </div>
      {feedback && <div className="text-sm py-2">{feedback}</div>}

      {/* Customer card */}
      <Card>
        <CardHeader><CardTitle className="text-sm">👤 Customer</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div><span className="font-medium">Nama:</span> {order.customerName}</div>
          <div><span className="font-medium">Kontak:</span> {order.customerContact}</div>
          {order.notesCustomer && <div><span className="font-medium">Catatan:</span> {order.notesCustomer}</div>}
        </CardContent>
      </Card>

      {/* Config card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">⚙️ Config {order.configJsonOperator ? "(operator override)" : "(customer)"}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setConfigEditing(!configEditing)}>
              {configEditing ? "Cancel" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configEditing ? (
            <div className="space-y-2">
              <Textarea
                className="font-mono text-xs"
                rows={8}
                value={effectiveConfig}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setConfigOverride(e.target.value)}
              />
              <Button size="sm" onClick={handleSaveConfig} disabled={updateOrder.isPending}>Simpan Config</Button>
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Ukuran</span><span>{parsedConfig.size}</span>
                <span className="text-muted-foreground">Shape</span><span>{parsedConfig.shape}</span>
                {parsedConfig.shapeRatio && <>
                  <span className="text-muted-foreground">Ratio</span>
                  <span>{parsedConfig.shapeRatio.width}:{parsedConfig.shapeRatio.height}</span>
                </>}
                <span className="text-muted-foreground">Shadow Ø</span><span>{parsedConfig.shadowDiameter} cm</span>
                <span className="text-muted-foreground">Offset</span>
                <span>X:{parsedConfig.shadowOffsetX} Y:{parsedConfig.shadowOffsetY} mm</span>
                <span className="text-muted-foreground">Support Stems</span><span>{parsedConfig.supportStems ? "Ya" : "Tidak"}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Images card */}
      <Card>
        <CardHeader><CardTitle className="text-sm">🖼️ Gambar</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs font-medium mb-1">Silhouette ({order.imagePath.split("/").pop()})</div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer inline-flex items-center">
                <Button variant="outline" size="sm" type="button" onClick={() => {}}>
                  {uploadSilhouette.isPending ? "Uploading..." : "Upload / Replace"}
                </Button>
                <input type="file" accept="image/*" className="absolute opacity-0 pointer-events-none w-px h-px"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFileUpload("silhouette", e)} />
              </label>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1">Floor Insert {order.additionalImagePath ? `(${order.additionalImagePath.split("/").pop()})` : "(belum ada)"}</div>
            <label className="cursor-pointer inline-flex items-center">
              <Button variant="outline" size="sm" type="button" onClick={() => {}}>
                {uploadAdditional.isPending ? "Uploading..." : "Upload / Replace"}
              </Button>
              <input type="file" accept="image/*" className="absolute opacity-0 pointer-events-none w-px h-px"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFileUpload("additional", e)} />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* STL card */}
      <Card>
        <CardHeader><CardTitle className="text-sm">🖨️ STL</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {order.stlPath ? `File: ${order.stlPath}` : "Belum ada STL"}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleGenerate}
              disabled={generateStl.isPending || order.status === "generating"}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {generateStl.isPending || order.status === "generating" ? "Generating..." : "Generate STL"}
            </Button>
            {order.stlPath && (
              <a
                href={`/api/light-generator/orders/${order.id}/stl`}
                download
                className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                Download STL
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status + notes */}
      <Card>
        <CardHeader><CardTitle className="text-sm">📝 Status & Pesan</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <select
              value={effectiveStatus}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusDraft(e.target.value)}
              className="w-40 h-7 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <Button onClick={handleSaveStatus} disabled={updateOrder.isPending} size="sm">
              Simpan
            </Button>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium">Pesan ke Customer (customer-visible)</div>
            <Textarea
              rows={3}
              placeholder="Pesan yang terlihat oleh customer..."
              value={effectiveStatusNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStatusNote(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium">Catatan Operator (internal)</div>
            <Textarea
              rows={3}
              placeholder="Catatan internal..."
              value={effectiveNotesOperator}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotesOperator(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
