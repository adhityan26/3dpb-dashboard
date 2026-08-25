import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { NoSuchKey } from "@aws-sdk/client-s3"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/ring-resizer/storage", () => ({
  downloadRingZip: vi.fn(),
}))

import { auth } from "@/lib/auth"
import { downloadRingZip } from "@/lib/ring-resizer/storage"
import { GET } from "../route"

const mockAuth = vi.mocked(auth)
const session = {
  user: { id: "u1", name: "a" },
  expires: "2099-01-01T00:00:00.000Z",
} as unknown as Awaited<ReturnType<typeof auth>>
const UUID = "123e4567-e89b-42d3-a456-426614174000"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function req(name?: string): NextRequest {
  const url = new URL(`http://x/api/ring-resizer/results/${UUID}${name ? `?name=${encodeURIComponent(name)}` : ""}`)
  return { nextUrl: url } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session)
})

describe("GET /api/ring-resizer/results/[id]", () => {
  it("401 tanpa session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(req(), ctx(UUID))
    expect(res.status).toBe(401)
  })

  it("400 untuk id yang bukan uuid", async () => {
    const res = await GET(req(), ctx("../../etc/passwd"))
    expect(res.status).toBe(400)
    expect(downloadRingZip).not.toHaveBeenCalled()
  })

  it("404 kalau hasil tidak ada di storage", async () => {
    vi.mocked(downloadRingZip).mockRejectedValue(new NoSuchKey({ $metadata: {}, message: "gone" }))
    const res = await GET(req(), ctx(UUID))
    expect(res.status).toBe(404)
  })

  it("mengirim ZIP dengan Content-Length + attachment filename tersanitasi", async () => {
    vi.mocked(downloadRingZip).mockResolvedValue(Buffer.from("zip-bytes"))
    const res = await GET(req('GL 2026 / "8".zip'), ctx(UUID))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    expect(res.headers.get("Content-Length")).toBe("9")
    const cd = res.headers.get("Content-Disposition") ?? ""
    expect(cd).toContain("attachment")
    expect(cd).not.toMatch(/["]{2}|[/\\]/) // sanitized: no raw quotes/slashes inside name
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("zip-bytes")
  })
})
