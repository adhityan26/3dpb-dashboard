import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findClaimablePayment, markPaid } from "@/lib/payment/service";
import { putProof, R2NotConfigured } from "@/lib/storage/r2";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const ID_RE = /^[a-z0-9]+$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;

  if (!ID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const claimable = await findClaimablePayment(id, userId);
  if (!claimable) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("bukti");
    if (f && typeof f !== "string") file = f as File;
  } catch {
    return NextResponse.json({ error: "bukti_wajib" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "bukti_wajib" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "tipe_tidak_didukung" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_terlalu_besar" }, { status: 400 });

  const proofKey = `proofs/${id}.jpg`;
  try {
    await putProof(proofKey, await file.arrayBuffer(), file.type);
  } catch (e) {
    if (e instanceof R2NotConfigured) return NextResponse.json({ error: "upload_belum_aktif" }, { status: 503 });
    return NextResponse.json({ error: "upload_gagal" }, { status: 502 });
  }

  try {
    await markPaid(id, userId, { proofKey, proofType: file.type });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
