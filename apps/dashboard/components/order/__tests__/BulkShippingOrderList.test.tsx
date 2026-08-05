// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BulkShippingOrderList } from "../BulkShippingOrderList"
import type { OrderSummary } from "@/lib/orders/types"

function makeOrder(orderSn: string): OrderSummary {
  return {
    orderSn,
    shopeeStatus: "READY_TO_SHIP",
    createTime: 0,
    updateTime: 0,
    totalAmount: 10000,
    currency: "IDR",
    buyerUsername: "buyer1",
    items: [{ productName: "Vas Bunga", variantName: null, sku: null, qty: 1, unitPrice: 10000, imageUrl: null }],
    labelPrinted: false,
    labelPrintedAt: null,
    labelPrintedBy: null,
    isPreOrder: false,
    shipByDate: null,
    shippingCarrier: null,
  }
}

describe("BulkShippingOrderList", () => {
  it("renders a checkbox per order and a select-all checkbox", () => {
    const orders = [makeOrder("S1"), makeOrder("S2")]
    render(
      <BulkShippingOrderList
        orders={orders}
        selectedSns={new Set()}
        onToggleSelect={() => {}}
        onToggleSelectAll={() => {}}
      />,
    )
    expect(screen.getAllByRole("checkbox")).toHaveLength(3) // 2 rows + select-all
  })

  it("calls onToggleSelect with the order sn when a row checkbox is clicked", () => {
    const onToggleSelect = vi.fn()
    render(
      <BulkShippingOrderList
        orders={[makeOrder("S1")]}
        selectedSns={new Set()}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={() => {}}
      />,
    )
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    expect(onToggleSelect).toHaveBeenCalledWith("S1")
  })

  it("calls onToggleSelectAll when the header checkbox is clicked", () => {
    const onToggleSelectAll = vi.fn()
    render(
      <BulkShippingOrderList
        orders={[makeOrder("S1")]}
        selectedSns={new Set()}
        onToggleSelect={() => {}}
        onToggleSelectAll={onToggleSelectAll}
      />,
    )
    fireEvent.click(screen.getByLabelText(/pilih semua/i))
    expect(onToggleSelectAll).toHaveBeenCalled()
  })

  it("shows a row as checked when its orderSn is in selectedSns", () => {
    render(
      <BulkShippingOrderList
        orders={[makeOrder("S1")]}
        selectedSns={new Set(["S1"])}
        onToggleSelect={() => {}}
        onToggleSelectAll={() => {}}
      />,
    )
    expect(screen.getByLabelText("Pilih order S1")).toBeChecked()
  })

  it("renders product name and variant name separately", () => {
    const order = makeOrder("S1")
    order.items = [{ productName: "Vas Bunga", variantName: "Merah / Besar", sku: null, qty: 1, unitPrice: 10000, imageUrl: null }]
    render(
      <BulkShippingOrderList orders={[order]} selectedSns={new Set()} onToggleSelect={() => {}} onToggleSelectAll={() => {}} />,
    )
    expect(screen.getByText("Vas Bunga")).toBeInTheDocument()
    expect(screen.getByText(/Merah \/ Besar/)).toBeInTheDocument()
  })

  it("renders order date, ship-by date, and shipping carrier", () => {
    const order = makeOrder("S1")
    order.createTime = 1735689600
    order.shipByDate = 1735776000
    order.shippingCarrier = "JNE Reguler"
    render(
      <BulkShippingOrderList orders={[order]} selectedSns={new Set()} onToggleSelect={() => {}} onToggleSelectAll={() => {}} />,
    )
    expect(screen.getByText(/Dipesan/)).toBeInTheDocument()
    expect(screen.getByText(/Kirim sebelum/)).toBeInTheDocument()
    expect(screen.getByText(/JNE Reguler/)).toBeInTheDocument()
  })

  it("renders an empty state when there are no orders", () => {
    render(
      <BulkShippingOrderList orders={[]} selectedSns={new Set()} onToggleSelect={() => {}} onToggleSelectAll={() => {}} />,
    )
    expect(screen.getByText(/tidak ada order/i)).toBeInTheDocument()
  })
})
