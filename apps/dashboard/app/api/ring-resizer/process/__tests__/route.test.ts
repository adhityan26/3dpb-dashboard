import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { unzipSync } from "fflate"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    ringModel: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/ring-resizer/storage", () => ({
  downloadRingStl: vi.fn(),
  uploadRingZip: vi.fn(),
}))
vi.mock("@/lib/ring-resizer/mesh/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ring-resizer/mesh/pipeline")>(
    "@/lib/ring-resizer/mesh/pipeline",
  )
  return {
    ...actual, // keep the real sanitizeLabel — the dedupe test depends on its behavior
    processPart: vi.fn(),
  }
})

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { downloadRingStl, uploadRingZip } from "@/lib/ring-resizer/storage"
import { processPart } from "@/lib/ring-resizer/mesh/pipeline"
import { POST } from "../route"

type RingModelWithParts = Awaited<ReturnType<typeof prisma.ringModel.findUnique>>

const mockAuth = vi.mocked(auth)
const session = {
  user: { id: "u1", name: "a" },
  expires: "2099-01-01T00:00:00.000Z",
} as unknown as Awaited<ReturnType<typeof auth>>

function jsonReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

const baseBody = { modelId: "m1", mode: "dia" as const, value: 18, clearanceMm: 0.3, text: "US 8" }

function part(id: string, name: string) {
  return { id, name, anchors: [] }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session)
  vi.mocked(processPart).mockImplementation(async () => ({
    stl: Buffer.from("fake-stl"),
    engraved: true,
    warning: undefined,
  }))
})

describe("POST /api/ring-resizer/process", () => {
  it("401 tanpa session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(jsonReq(baseBody))
    expect(res.status).toBe(401)
    expect(prisma.ringModel.findUnique).not.toHaveBeenCalled()
  })

  it("404 kalau model tidak ada", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue(null)
    const res = await POST(jsonReq(baseBody))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "model not found" })
  })

  it("warnings ada di JSON response (part gagal download dilewati, bukan 500 generik)", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue({
      id: "m1",
      name: "Model A",
      baseBoreMm: 16,
      parts: [part("p1", "ok-part"), part("p2", "missing-part")],
    } as unknown as RingModelWithParts)
    vi.mocked(downloadRingStl).mockImplementation(async (_modelId: string, partId: string) => {
      if (partId === "p2") throw new Error("NoSuchKey")
      return Buffer.from("stl-bytes")
    })

    const res = await POST(jsonReq(baseBody))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.warnings).toEqual(["missing-part: file STL tidak ditemukan di storage — part dilewati"])
    expect(json.downloadUrl).toMatch(/^\/api\/ring-resizer\/results\/[0-9a-f-]{36}\?name=/)
    expect(json.fileName).toContain("Model_A")
    // The part that failed to download must not reach processPart at all.
    expect(processPart).toHaveBeenCalledTimes(1)
    // The ZIP itself is stored, not returned inline.
    expect(uploadRingZip).toHaveBeenCalledTimes(1)
  })

  it("500 kalau SEMUA part gagal download — bukan zip kosong", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue({
      id: "m1",
      name: "Model A",
      baseBoreMm: 16,
      parts: [part("p1", "a"), part("p2", "b")],
    } as unknown as RingModelWithParts)
    vi.mocked(downloadRingStl).mockRejectedValue(new Error("NoSuchKey"))

    const res = await POST(jsonReq(baseBody))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/all parts failed/i)
    expect(json.warnings).toHaveLength(2)
  })

  it("dua part dengan nama yang sanitize ke key sama → dua entry ZIP berbeda, bukan overwrite", async () => {
    vi.mocked(prisma.ringModel.findUnique).mockResolvedValue({
      id: "m1",
      name: "Model A",
      baseBoreMm: 16,
      parts: [part("p1", "Part A"), part("p2", "Part A")],
    } as unknown as RingModelWithParts)
    vi.mocked(downloadRingStl).mockResolvedValue(Buffer.from("stl-bytes"))
    let call = 0
    vi.mocked(processPart).mockImplementation(async () => {
      call++
      return { stl: Buffer.from(`stl-${call}`), engraved: true, warning: undefined }
    })

    const res = await POST(jsonReq(baseBody))

    expect(res.status).toBe(200)
    const zipBytes = vi.mocked(uploadRingZip).mock.calls[0][1] as Uint8Array
    const entries = unzipSync(zipBytes)
    const names = Object.keys(entries)
    expect(names).toHaveLength(2)
    // Both entries derive from "Part A" but must be distinct keys.
    expect(new Set(names).size).toBe(2)
    expect(names.some((n) => n.startsWith("Part_A_"))).toBe(true)
    expect(names.some((n) => n.startsWith("Part_A-2_"))).toBe(true)
  })
})
