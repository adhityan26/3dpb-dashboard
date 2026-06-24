import nacl from "tweetnacl"

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) throw new Error("bad hex")
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Verify a Discord interaction request's ed25519 signature. */
export function verifyDiscordSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): boolean {
  try {
    const message = new TextEncoder().encode(timestamp + rawBody)
    return nacl.sign.detached.verify(message, hexToBytes(signature), hexToBytes(publicKey))
  } catch {
    return false
  }
}
