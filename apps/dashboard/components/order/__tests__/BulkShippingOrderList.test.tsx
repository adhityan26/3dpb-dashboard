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

  it("renders an empty state when there are no orders", () => {
    render(
      <BulkShippingOrderList orders={[]} selectedSns={new Set()} onToggleSelect={() => {}} onToggleSelectAll={() => {}} />,
    )
    expect(screen.getByText(/tidak ada order/i)).toBeInTheDocument()
  })
})
