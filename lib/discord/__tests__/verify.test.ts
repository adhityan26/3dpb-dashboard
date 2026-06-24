import { describe, it, expect } from "vitest"
import nacl from "tweetnacl"
import { verifyDiscordSignature } from "@/lib/discord/verify"

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

describe("verifyDiscordSignature", () => {
  const kp = nacl.sign.keyPair()
  const publicKeyHex = hex(kp.publicKey)
  const timestamp = "1700000000"
  const body = JSON.stringify({ type: 1 })

  it("returns true for a valid signature", () => {
    const message = new TextEncoder().encode(timestamp + body)
    const sig = hex(nacl.sign.detached(message, kp.secretKey))
    expect(verifyDiscordSignature(body, sig, timestamp, publicKeyHex)).toBe(true)
  })

  it("returns false for a tampered body", () => {
    const message = new TextEncoder().encode(timestamp + body)
    const sig = hex(nacl.sign.detached(message, kp.secretKey))
    expect(verifyDiscordSignature('{"type":2}', sig, timestamp, publicKeyHex)).toBe(false)
  })

  it("returns false for malformed signature hex", () => {
    expect(verifyDiscordSignature(body, "zzzz", timestamp, publicKeyHex)).toBe(false)
  })
})
