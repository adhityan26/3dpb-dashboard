import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set: cookieSet })) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    entitlement: { create: vi.fn() },
    session: { create: vi.fn() },
  },
}));
import { prisma } from "@/lib/db";
import { upsertUserByPhone, createUserSession } from "@/lib/wa/session";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = "http://192.168.88.113:3300";
  (prisma.session.create as any).mockResolvedValue({});
  (prisma.entitlement.create as any).mockResolvedValue({});
});

describe("upsertUserByPhone", () => {
  it("nomor baru → create user + entitlement", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({ id: "u1", phone: "628111" });
    const u = await upsertUserByPhone("628111");
    expect(u.id).toBe("u1");
    expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ phone: "628111" }) });
    expect(prisma.entitlement.create).toHaveBeenCalledWith({ data: { userId: "u1" } });
  });
  it("nomor lama sudah verified → tak create ulang", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u2", phone: "628111", phoneVerified: new Date() });
    const u = await upsertUserByPhone("628111");
    expect(u.id).toBe("u2");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.entitlement.create).not.toHaveBeenCalled();
  });
});

describe("createUserSession", () => {
  it("buat Session row + set cookie authjs.session-token (http)", async () => {
    (prisma.session.create as any).mockResolvedValue({});
    await createUserSession("u1", new Date("2026-07-18T10:00:00Z"));
    const arg = (prisma.session.create as any).mock.calls[0][0].data;
    expect(arg.userId).toBe("u1");
    expect(typeof arg.sessionToken).toBe("string");
    const [name, value, opts] = cookieSet.mock.calls[0];
    expect(name).toBe("authjs.session-token");
    expect(value).toBe(arg.sessionToken);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
  });
  it("https origin → cookie __Secure- + secure true", async () => {
    process.env.NEXTAUTH_URL = "https://app.slizebiz.com";
    (prisma.session.create as any).mockResolvedValue({});
    await createUserSession("u1", new Date("2026-07-18T10:00:00Z"));
    const [name, , opts] = cookieSet.mock.calls[0];
    expect(name).toBe("__Secure-authjs.session-token");
    expect(opts.secure).toBe(true);
  });
});
