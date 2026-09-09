import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: { workingProject: { findUnique: vi.fn() } } }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/shopee/orders", () => ({ getOrderDetail: vi.fn() }))
vi.mock("@/lib/tokopedia/orders", () => ({ getOrderById: vi.fn() }))

import { GET } from "../route"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getOrderById } from "@/lib/tokopedia/orders"

describe("GET /api/working-projects/[id]/detail-source", () => {
  it("401s when there is no session", async () => {
    ;(auth as any).mockResolvedValue(null)
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "wp1" }) })
    expect(res.status).toBe(401)
  })

  it("404s when the project has no sourceOrderNo", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u1" } })
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ source: "manual", sourceOrderNo: null })
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "wp1" }) })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "no_source" })
  })

  it("404s when source is not shopee/tokopedia even with a sourceOrderNo", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u1" } })
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ source: "manual", sourceOrderNo: "X1" })
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "wp1" }) })
    expect(res.status).toBe(404)
  })

  it("404s when the project does not exist", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u1" } })
    ;(prisma.workingProject.findUnique as any).mockResolvedValue(null)
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "wp1" }) })
    expect(res.status).toBe(404)
  })

  it("fetches live Shopee detail when source is shopee", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u1" } })
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ source: "shopee", sourceOrderNo: "SN1" })
    ;(getOrderDetail as any).mockResolvedValue([{ order_sn: "SN1" }])
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "wp1" }) })
    expect(getOrderDetail).toHaveBeenCalledWith(["SN1"])
    expect(await res.json()).toEqual({ order_sn: "SN1" })
  })

  it("404s when Shopee detail lookup returns nothing", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u1" } })
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ source: "shopee", sourceOrderNo: "SN1" })
    ;(getOrderDetail as any).mockResolvedValue([])
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "wp1" }) })
    expect(res.status).toBe(404)
  })

  it("fetches live Tokopedia detail when source is tokopedia", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u1" } })
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ source: "tokopedia", sourceOrderNo: "TK1" })
    ;(getOrderById as any).mockResolvedValue({ id: "TK1" })
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "wp1" }) })
    expect(getOrderById).toHaveBeenCalledWith("TK1")
    expect(await res.json()).toEqual({ id: "TK1" })
  })

  it("404s when Tokopedia detail lookup returns null", async () => {
    ;(auth as any).mockResolvedValue({ user: { id: "u1" } })
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ source: "tokopedia", sourceOrderNo: "TK1" })
    ;(getOrderById as any).mockResolvedValue(null)
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "wp1" }) })
    expect(res.status).toBe(404)
  })
})
