import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { putLog } from "@/lib/storage/r2";

const MAX_LOG_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;

  // Cek ukuran yang DIKLAIM SEBELUM buffer -- client kita (ipc.ts) selalu kirim body Buffer,
  // jadi Node's fetch set Content-Length otomatis; tolak request kebesaran tanpa pernah
  // menarik body-nya ke memori server. Content-Length hilang/bohong tetap ketangkep di
  // pengecekan byteLength di bawah (defense in depth), cuma setelah buffer.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_LOG_BYTES) {
    return NextResponse.json({ error: "log_too_large" }, { status: 413 });
  }

  const body = await req.arrayBuffer();
  // Tolak yang kebesaran, jangan diam-diam dipotong -- log yang terpotong lebih buruk
  // daripada tak ada log sama sekali, karena bagian yang hilang justru biasanya bagian akhir
  // (baris-baris terakhir sebelum crash).
  if (body.byteLength > MAX_LOG_BYTES) {
    return NextResponse.json({ error: "log_too_large" }, { status: 413 });
  }

  const key = `agent-logs/${result.userId}/${Date.now()}.log`;
  try {
    await putLog(key, body);
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
