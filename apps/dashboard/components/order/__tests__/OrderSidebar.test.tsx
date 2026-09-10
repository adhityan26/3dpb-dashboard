// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { OrderSidebar } from "../OrderSidebar"

describe("OrderSidebar", () => {
  it("renders Working Project as the first channel item, above Shopee", () => {
    render(<OrderSidebar active="shopee" onChange={vi.fn()} />)
    const items = screen.getAllByRole("button")
    expect(items[0]).toHaveTextContent("Working Project")
  })
})
