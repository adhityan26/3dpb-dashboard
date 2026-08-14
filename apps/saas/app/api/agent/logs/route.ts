import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { putLog } from "@/lib/storage/r2";

const MAX_LOG_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;

  // Check the DECLARED size BEFORE buffering -- our client (ipc.ts) always sends a Buffer
  // body, so Node's fetch sets Content-Length automatically; reject oversized requests
  // without ever pulling the body into server memory. A missing/lying Content-Length is
  // still caught by the byteLength check below (defense in depth), just after buffering.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_LOG_BYTES) {
    return NextResponse.json({ error: "log_too_large" }, { status: 413 });
  }

  const body = await req.arrayBuffer();
  // Reject oversized bodies rather than silently truncating -- a truncated log is worse
  // than no log at all, since the missing part is usually the tail (the last lines before
  // a crash).
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
