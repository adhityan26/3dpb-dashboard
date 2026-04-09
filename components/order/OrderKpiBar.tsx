"use client"

import { Card, CardContent } from "@/components/ui/card"

interface OrderKpiBarProps {
  total: number
  belumCetak: number
  sudahCetak: number
}

export function OrderKpiBar({ total, belumCetak, sudahCetak }: OrderKpiBarProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Order</div>
          <div className="text-2xl font-bold text-[#EE4D2D]">{total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Belum Cetak</div>
          <div className="text-2xl font-bold text-amber-600">{belumCetak}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Sudah Cetak</div>
          <div className="text-2xl font-bold text-green-600">{sudahCetak}</div>
        </CardContent>
      </Card>
    </div>
  )
}
