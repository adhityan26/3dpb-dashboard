import { describe, it, expect, vi } from "vitest"

describe("auth config", () => {
  it("should export handlers, signIn, signOut, auth", async () => {
    vi.mock("next-auth", () => ({
      default: vi.fn().mockReturnValue({
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn(),
      }),
    }))
    vi.mock("next-auth/providers/authentik", () => ({
      default: vi.fn().mockReturnValue({ id: "authentik" }),
    }))
    vi.mock("@/lib/db", () => ({
      prisma: { user: { findUnique: vi.fn() } },
    }))

    const { handlers, signIn, signOut, auth } = await import("@/lib/auth")
    expect(handlers).toBeDefined()
    expect(signIn).toBeDefined()
    expect(signOut).toBeDefined()
    expect(auth).toBeDefined()
  })
})
