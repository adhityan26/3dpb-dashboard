"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { ProductsListResult } from "@/lib/products/types"

interface Props {
  kpi: ProductsListResult["kpi"]
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n)
}

export function ProductsKpiBar({ kpi }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Produk</div>
          <div className="text-2xl font-bold text-[#EE4D2D]">
            {kpi.totalProducts}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Stok Kritis</div>
          <div className="text-2xl font-bold text-red-600">
            {kpi.stokKritis}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Perlu Perhatian</div>
          <div className="text-2xl font-bold text-amber-600">
            {kpi.perluPerhatian}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Stok</div>
          <div className="text-2xl font-bold text-blue-600">
            {fmtNum(kpi.totalStockItems)}
            <span className="text-sm font-normal text-gray-400"> pcs</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
