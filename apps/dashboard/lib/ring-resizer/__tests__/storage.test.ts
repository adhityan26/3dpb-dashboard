import { describe, it, expect, vi, beforeEach } from "vitest"
import { NoSuchKey } from "@aws-sdk/client-s3"

const sent: unknown[] = []
let throwError: unknown = null

vi.mock("@/lib/minio", () => ({
  getMinioClient: () => ({
    send: vi.fn(async (cmd: unknown) => {
      if (throwError) {
        throw throwError
      }
      sent.push(cmd)
      const name = (cmd as { constructor: { name: string } }).constructor.name
      if (name === "GetObjectCommand") {
        return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }
      }
      return {}
    }),
  }),
}))

import { ringPartKey, uploadRingStl, downloadRingStl, deleteRingStl } from "../storage"

beforeEach(() => {
  sent.length = 0
  throwError = null
})

describe("ring storage", () => {
  it("builds keys as modelId/partId.stl", () => {
    expect(ringPartKey("m1", "p1")).toBe("m1/p1.stl")
  })

  it("upload sends PutObjectCommand with the right key", async () => {
    await uploadRingStl("m1", "p1", Buffer.from("x"))
    const put = sent.find((c) => (c as { constructor: { name: string } }).constructor.name === "PutObjectCommand")
    expect(put).toBeDefined()
    expect((put as { input: { Key: string } }).input.Key).toBe("m1/p1.stl")
  })

  it("download returns the object bytes as Buffer", async () => {
    const buf = await downloadRingStl("m1", "p1")
    expect([...buf]).toEqual([1, 2, 3])
  })

  it("delete sends DeleteObjectCommand with the right key", async () => {
    await deleteRingStl("m1", "p1")
    const del = sent.find((c) => (c as { constructor: { name: string } }).constructor.name === "DeleteObjectCommand")
    expect(del).toBeDefined()
    expect((del as { input: { Key: string } }).input.Key).toBe("m1/p1.stl")
  })

  it("delete swallows NoSuchKey errors", async () => {
    const nosuchKeyErr = new NoSuchKey({ $metadata: {}, message: "Not found" })
    throwError = nosuchKeyErr
    await expect(deleteRingStl("m1", "p1")).resolves.toBeUndefined()
  })

  it("delete rethrows other errors", async () => {
    const otherErr = new Error("Permission denied")
    throwError = otherErr
    await expect(deleteRingStl("m1", "p1")).rejects.toThrow("Permission denied")
  })
})
