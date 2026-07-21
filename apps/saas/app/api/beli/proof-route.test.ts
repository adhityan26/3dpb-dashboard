import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const findUniqueMock = vi.fn();
const getProofMock = vi.fn();
const isOwnerMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/db", () => ({ prisma: { payment: { findUnique: (...a: unknown[]) => findUniqueMock(...a) } } }));
vi.mock("@/lib/storage/r2", () => ({ getProof: (...a: unknown[]) => getProofMock(...a) }));
vi.mock("@/lib/owner", () => ({ isOwner: (...a: unknown[]) => isOwnerMock(...a) }));

import { GET } from "@/app/api/beli/[id]/proof/route";

const ctx = { params: Promise.resolve({ id: "p1" }) };
beforeEach(() => {
  authMock.mockReset(); findUniqueMock.mockReset(); getProofMock.mockReset(); isOwnerMock.mockReset();
  isOwnerMock.mockReturnValue(false);
  getProofMock.mockResolvedValue({ body: new ArrayBuffer(3), contentType: "image/jpeg" });
});

describe("GET proof", () => {
  it("anon → 404", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET({} as Request, ctx)).status).toBe(404);
  });
  it("user pemilik → 200 + content-type", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
    const res = await GET({} as Request, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });
  it("user lain → 404", async () => {
    authMock.mockResolvedValue({ user: { id: "lain", email: "x@y.z" } });
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
    expect((await GET({} as Request, ctx)).status).toBe(404);
  });
  it("owner (admin) → 200", async () => {
    authMock.mockResolvedValue({ user: { id: "adm", email: "owner@x.com" } });
    isOwnerMock.mockReturnValue(true);
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
    expect((await GET({} as Request, ctx)).status).toBe(200);
  });
  it("tanpa proofKey → 404", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: null });
    expect((await GET({} as Request, ctx)).status).toBe(404);
  });
  it("objek sudah hilang di R2 → 404", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    findUniqueMock.mockResolvedValue({ id: "p1", userId: "u1", proofKey: "proofs/p1.jpg", proofType: "image/jpeg" });
    getProofMock.mockResolvedValue(null);
    expect((await GET({} as Request, ctx)).status).toBe(404);
  });
});
