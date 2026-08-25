import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { makeCubeStl } from "@/lib/ring-resizer/mesh/stl"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    ringModel: { findUnique: vi.fn() },
    ringPart: { create: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock("@/lib/ring-resizer/storage", () => ({
  uploadRingStl: vi.fn(),
}))

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { uploadRingStl } from "@/lib/ring-resizer/storage"
import { POST } from "../route"

type RingModelRow = Awaited<ReturnType<typeof prisma.ringModel.findUnique>>
type RingPartRow = Awaited<ReturnType<typeof prisma.ringPart.create>>

const mockAuth = vi.mocked(auth)
const session = {
  user: { id: "u1", name: "a" },
  expires: "2099-01-01T00:00:00.000Z",
} as unknown as Awaited<ReturnType<typeof auth>>
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function formReq(form: FormData): NextRequest {
  return { formData: async () => form } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session)
})

describe("POST /api/ring-resizer/models/[id]/parts", () => {
  it("401 tanpa session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(formReq(new FormData()), ctx("m1"))
    expect(res.status).toBe(401)
    expect(prisma.ringModel.findUnique).not.toHaveBeenCalled()
  })

  it("404 kalau model tidak ada", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue(null)
    const res = await POST(formReq(new FormData()), ctx("missing"))
    expect(res.status).toBe(404)
  })

  it("400 kalau file/name tidak ada di form", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue({ id: "m1" } as unknown as RingModelRow)
    const res = await POST(formReq(new FormData()), ctx("m1"))
    expect(res.status).toBe(400)
    expect(prisma.ringPart.create).not.toHaveBeenCalled()
  })

  it("400 kalau STL invalid, part row tidak pernah dibuat", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue({ id: "m1" } as unknown as RingModelRow)
    const form = new FormData()
    form.append("name", "part-a")
    form.append("file", new File([Buffer.from("not an stl")], "part.stl"))
    const res = await POST(formReq(form), ctx("m1"))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: expect.stringContaining("invalid STL") })
    expect(prisma.ringPart.create).not.toHaveBeenCalled()
    expect(uploadRingStl).not.toHaveBeenCalled()
  })

  it("500 kalau upload storage gagal — part row yang baru dibuat di-rollback (delete), bukan orphan", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue({ id: "m1" } as unknown as RingModelRow)
    vi.mocked(prisma.ringPart.create).mockResolvedValue({ id: "p1", modelId: "m1", name: "part-a" } as unknown as RingPartRow)
    vi.mocked(prisma.ringPart.delete).mockResolvedValue({ id: "p1" } as unknown as RingPartRow)
    vi.mocked(uploadRingStl).mockRejectedValue(new Error("minio down"))
    const stl = new Uint8Array(makeCubeStl(10))
    const form = new FormData()
    form.append("name", "part-a")
    form.append("file", new File([stl], "part.stl"))

    const res = await POST(formReq(form), ctx("m1"))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: expect.stringContaining("failed to store STL") })
    expect(prisma.ringPart.create).toHaveBeenCalledTimes(1)
    // The orphan row must be rolled back — no dangling ringPart left behind.
    expect(prisma.ringPart.delete).toHaveBeenCalledWith({ where: { id: "p1" } })
  })

  it("201 kalau upload sukses", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue({ id: "m1" } as unknown as RingModelRow)
    const created = { id: "p1", modelId: "m1", name: "part-a" }
    vi.mocked(prisma.ringPart.create).mockResolvedValue(created as unknown as RingPartRow)
    vi.mocked(uploadRingStl).mockResolvedValue(undefined)
    const stl = new Uint8Array(makeCubeStl(10))
    const form = new FormData()
    form.append("name", "part-a")
    form.append("file", new File([stl], "part.stl"))

    const res = await POST(formReq(form), ctx("m1"))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ part: created })
    expect(prisma.ringPart.delete).not.toHaveBeenCalled()
  })
})
