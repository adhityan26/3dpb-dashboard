import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/ring-resizer/storage", () => ({
  listRingResults: vi.fn(),
  presignRingZipUrl: vi.fn(async (id: string) => `http://minio/results/${id}.zip?sig`),
}))

import { auth } from "@/lib/auth"
import { listRingResults } from "@/lib/ring-resizer/storage"
import { GET } from "../route"

const session = { user: { id: "u1" }, expires: "2099-01-01" } as unknown as Awaited<ReturnType<typeof auth>>
const req = (qs = ""): NextRequest =>
  ({ nextUrl: new URL(`http://x/api/ring-resizer/results${qs}`) }) as unknown as NextRequest
const ID = "d366a267-2847-4aa8-8bdc-b74dddcc9a91"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(session)
})

describe("GET /api/ring-resizer/results", () => {
  it("401 tanpa session", async () => {
    vi.mocked(auth).mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
  })

  it("pakai metadata kalau ada", async () => {
    vi.mocked(listRingResults).mockResolvedValue([{
      id: ID, lastModified: "2026-09-28T07:19:25.000Z", sizeBytes: 155e6,
      entries: ["Ring_7.5.stl"], fileName: "GL_Ring_7.5.zip", model: "GL_Ring", label: "7.5",
    }])
    const { items } = await (await GET(req())).json()
    expect(items[0]).toMatchObject({
      id: ID, label: "7.5", model: "GL_Ring", fileName: "GL_Ring_7.5.zip",
      downloadUrl: `/api/ring-resizer/results/${ID}?name=GL_Ring_7.5.zip`,
    })
    expect(items[0].directUrl).toContain(ID)
  })

  it("hasil lama tanpa metadata: label dari nama entry", async () => {
    vi.mocked(listRingResults).mockResolvedValue([{
      id: ID, lastModified: "2026-09-28T07:19:25.000Z", sizeBytes: 1,
      entries: ["Ring_6.5.stl", "Frame_6.5.stl"], fileName: null, model: null, label: null,
    }])
    const { items } = await (await GET(req())).json()
    expect(items[0]).toMatchObject({ label: "6.5", model: null, fileName: "ring_6.5.zip" })
  })

  it("limit di-clamp ke 50", async () => {
    vi.mocked(listRingResults).mockResolvedValue([])
    await GET(req("?limit=999"))
    expect(listRingResults).toHaveBeenCalledWith(50)
  })
})
