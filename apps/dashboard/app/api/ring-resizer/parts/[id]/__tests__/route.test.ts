import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    ringPart: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock("@/lib/ring-resizer/storage", () => ({
  deleteRingStl: vi.fn(),
}))

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { deleteRingStl } from "@/lib/ring-resizer/storage"
import { PATCH, DELETE } from "../route"

type PartRow = Awaited<ReturnType<typeof prisma.ringPart.findUnique>>

const mockAuth = vi.mocked(auth)
const session = {
  user: { id: "u1", name: "a" },
  expires: "2099-01-01T00:00:00.000Z",
} as unknown as Awaited<ReturnType<typeof auth>>
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const jsonReq = (body: unknown): NextRequest => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session)
})

describe("PATCH /api/ring-resizer/parts/[id]", () => {
  it("401 tanpa session", async () => {
    mockAuth.mockResolvedValue(null)
    expect((await PATCH(jsonReq({ name: "x" }), ctx("p1"))).status).toBe(401)
  })

  it("404 kalau part tidak ada", async () => {
    vi.mocked(prisma.ringPart.findUnique).mockResolvedValue(null)
    expect((await PATCH(jsonReq({ name: "x" }), ctx("nope"))).status).toBe(404)
  })

  it("400 kalau name kosong", async () => {
    vi.mocked(prisma.ringPart.findUnique).mockResolvedValue({ id: "p1" } as unknown as PartRow)
    expect((await PATCH(jsonReq({ name: "  " }), ctx("p1"))).status).toBe(400)
    expect(prisma.ringPart.update).not.toHaveBeenCalled()
  })

  it("rename sukses (nama di-trim)", async () => {
    vi.mocked(prisma.ringPart.findUnique).mockResolvedValue({ id: "p1" } as unknown as PartRow)
    vi.mocked(prisma.ringPart.update).mockResolvedValue({ id: "p1", name: "band" } as unknown as NonNullable<PartRow>)
    const res = await PATCH(jsonReq({ name: "  band " }), ctx("p1"))
    expect(res.status).toBe(200)
    expect(vi.mocked(prisma.ringPart.update).mock.calls[0][0]).toEqual({
      where: { id: "p1" },
      data: { name: "band" },
    })
  })
})

describe("PATCH /api/ring-resizer/parts/[id] rotation", () => {
  it("simpan rotasi tanpa name", async () => {
    vi.mocked(prisma.ringPart.findUnique).mockResolvedValue({ id: "p1" } as unknown as PartRow)
    vi.mocked(prisma.ringPart.update).mockResolvedValue({ id: "p1" } as unknown as NonNullable<PartRow>)
    const res = await PATCH(jsonReq({ rotXDeg: 90, rotYDeg: 0, rotZDeg: -45 }), ctx("p1"))
    expect(res.status).toBe(200)
    expect(vi.mocked(prisma.ringPart.update).mock.calls[0][0]).toEqual({
      where: { id: "p1" },
      data: { rotXDeg: 90, rotYDeg: 0, rotZDeg: -45 },
    })
  })

  it("400 kalau rotasi bukan angka / di luar range", async () => {
    vi.mocked(prisma.ringPart.findUnique).mockResolvedValue({ id: "p1" } as unknown as PartRow)
    expect((await PATCH(jsonReq({ rotXDeg: "90" }), ctx("p1"))).status).toBe(400)
    expect((await PATCH(jsonReq({ rotZDeg: 720 }), ctx("p1"))).status).toBe(400)
    expect(prisma.ringPart.update).not.toHaveBeenCalled()
  })

  it("400 kalau body kosong", async () => {
    vi.mocked(prisma.ringPart.findUnique).mockResolvedValue({ id: "p1" } as unknown as PartRow)
    expect((await PATCH(jsonReq({}), ctx("p1"))).status).toBe(400)
  })
})

describe("DELETE /api/ring-resizer/parts/[id]", () => {
  it("404 kalau part tidak ada", async () => {
    vi.mocked(prisma.ringPart.findUnique).mockResolvedValue(null)
    expect((await DELETE(jsonReq({}), ctx("nope"))).status).toBe(404)
    expect(prisma.ringPart.delete).not.toHaveBeenCalled()
  })

  it("hapus DB dulu lalu best-effort MinIO; MinIO gagal tidak menggagalkan request", async () => {
    vi.mocked(prisma.ringPart.findUnique).mockResolvedValue(
      { id: "p1", modelId: "m1" } as unknown as PartRow,
    )
    vi.mocked(prisma.ringPart.delete).mockResolvedValue({ id: "p1" } as unknown as NonNullable<PartRow>)
    vi.mocked(deleteRingStl).mockRejectedValue(new Error("minio down"))
    const res = await DELETE(jsonReq({}), ctx("p1"))
    expect(res.status).toBe(200)
    expect(prisma.ringPart.delete).toHaveBeenCalledWith({ where: { id: "p1" } })
    expect(deleteRingStl).toHaveBeenCalledWith("m1", "p1")
  })
})
