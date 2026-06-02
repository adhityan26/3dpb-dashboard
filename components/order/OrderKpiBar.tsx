"use client"

import { Card, CardContent } from "@/components/ui/card"

interface OrderKpiBarProps {
  total: number
  orderBaru: number
  perluCetak: number
  sudahDiproses: number
}

export function OrderKpiBar({ total, orderBaru, perluCetak, sudahDiproses }: OrderKpiBarProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Order</div>
          <div className="text-2xl font-bold text-[#EE4D2D]">{total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Order Baru</div>
          <div className="text-2xl font-bold text-amber-500">{orderBaru}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Perlu Cetak Label</div>
          <div className="text-2xl font-bold text-yellow-400">{perluCetak}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Processed</div>
          <div className="text-2xl font-bold text-green-600">{sudahDiproses}</div>
        </CardContent>
      </Card>
    </div>
  )
}
