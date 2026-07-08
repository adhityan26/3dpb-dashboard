"use client"

import { use, useState, useTransition } from "react"
import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { useLgOrder } from "@/lib/hooks/use-light-generator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { LgImageSlot } from "@/components/light-generator/LgImageSlot"
import { LgConfigEditor } from "@/components/light-generator/LgConfigEditor"
import { LgGeneratePanel } from "@/components/light-generator/LgGeneratePanel"

const STATUS_FLOW = ["submitted", "paid", "generating", "ready", "shipped", "cancelled"] as const
type OrderStatus = typeof STATUS_FLOW[number]

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "outline",
  paid:      "secondary",
  generating:"secondary",
  ready:     "default",
  shipped:   "default",
  cancelled: "destructive",
}

export default function LgOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading, refetch } = useLgOrder(id)

  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState<string | null>(null)
  const [currentConfig, setCurrentConfig] = useState<Record<string, unknown> | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Memuat...</div>
  if (!order) return <div className="py-12 text-center text-muted-foreground">Order tidak ditemukan</div>

  const customerConfig = (() => { try { return JSON.parse(order.configJson) } catch { return {} } })()
  const operatorConfig = (() => {
    if (!order.configJsonOperator) return null
    try { return JSON.parse(order.configJsonOperator) } catch { return null }
  })()
  const mergedConfig = currentConfig ?? { ...customerConfig, ...(operatorConfig ?? {}) }
  const effectiveNotes = notes ?? order.notesOperator ?? ""

  async function handleStatusChange(newStatus: OrderStatus) {
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/light-generator/orders/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        })
        if (!res.ok) { const b = await res.json().catch(() => ({})); setFeedback(`❌ ${b.error ?? res.statusText}`); return }
        setFeedback(`✅ Status → ${newStatus}`)
      } catch (err) { setFeedback(`❌ ${String(err)}`) }
    })
  }

  async function handleSaveNotes() {
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/light-generator/orders/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notesOperator: effectiveNotes }),
        })
        if (!res.ok) { const b = await res.json().catch(() => ({})); setFeedback(`❌ ${b.error ?? res.statusText}`); return }
        setFeedback("✅ Notes saved")
        setNotes(null)
      } catch (err) { setFeedback(`❌ ${String(err)}`) }
    })
  }

  return (
    <div className="container py-8 space-y-6">
      {feedback && <div className="text-sm py-2">{feedback}</div>}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/order">
          <Button variant="ghost" size="sm">&larr; Back</Button>
        </Link>
        <h1 className="text-xl font-semibold tracking-wide font-mono">{order.id}</h1>
        <Badge variant={STATUS_VARIANT[order.status] ?? "outline"} className="capitalize">
          {order.status}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          disabled={isLoading}
          onClick={() => {
            setCurrentConfig(null)
            setNotes(null)
            refetch()
          }}
        >
          <RefreshCw className="size-4 mr-1" />
          Reload
        </Button>
      </div>

      {/* Row 1: Customer + Order Details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Name:</span> {order.customerName}</p>
            <p><span className="text-muted-foreground">Contact:</span> {order.customerContact}</p>
            {order.notesCustomer && (
              <p><span className="text-muted-foreground">Notes:</span> {order.notesCustomer}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
            <CardDescription>
              {customerConfig.size ?? "—"} / {customerConfig.shape ?? "—"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Status:</span>{" "}
              <Badge variant={STATUS_VARIANT[order.status] ?? "outline"} className="capitalize">
                {order.status}
              </Badge>
            </p>
            <p><span className="text-muted-foreground">Created:</span> {new Date(order.createdAt).toLocaleString("id-ID")}</p>
            {order.stlPath && (
              <p>
                <span className="text-muted-foreground">STL:</span>{" "}
                <Badge variant="default">generated</Badge>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Images */}
      <Card>
        <CardHeader><CardTitle>Images</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <LgImageSlot
              orderId={id}
              label="Silhouette"
              type="silhouette"
              hasImage={!!order.imagePath}
            />
            <LgImageSlot
              orderId={id}
              label="Floor Insert"
              type="additional"
              hasImage={!!order.additionalImagePath}
            />
          </div>
        </CardContent>
      </Card>

      {/* Row 3: Update Status */}
      <Card>
        <CardHeader>
          <CardTitle>Update Status</CardTitle>
          <CardDescription>
            Current: <span className="font-medium capitalize">{order.status}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {STATUS_FLOW.filter((s) => s !== order.status).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "cancelled" ? "destructive" : "outline"}
              disabled={isPending}
              onClick={() => handleStatusChange(s)}
              className="capitalize"
            >
              {s === "cancelled" ? "Cancel" : `Mark ${s}`}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Row 4: Config editor (left 3/5) + Generate panel + Operator notes (right 2/5) */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <LgConfigEditor
            orderId={id}
            customerConfig={customerConfig}
            operatorConfig={operatorConfig}
            onConfigChange={setCurrentConfig}
            onReset={() => setCurrentConfig(null)}
          />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <LgGeneratePanel
            orderId={id}
            config={mergedConfig}
            initialStlReady={!!order.stlPath}
            hasSilhouette={!!order.imagePath}
          />
          <Card>
            <CardHeader><CardTitle>Operator Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={effectiveNotes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                rows={4}
                maxLength={2000}
                placeholder="Internal notes..."
              />
              <Button size="sm" variant="outline" disabled={isPending} onClick={handleSaveNotes}>
                Save notes
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
