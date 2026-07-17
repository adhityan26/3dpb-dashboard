"use client";
import { useState } from "react";
import { GlassInput } from "@3pb/ui";
export function WaitlistForm({ interest, onDone }: { interest: "beli" | "subscribe"; onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit() {
    setState("loading"); setMsg("");
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, interest }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setState("done"); onDone?.(); }
      else { setState("error"); setMsg(data.error ?? "gagal, coba lagi"); }
    } catch { setState("error"); setMsg("gagal, coba lagi"); }
  }
  if (state === "done") return <p className="text-sm g-t2">✅ Terdaftar! Kami email saat rilis.</p>;
  return (
    <div className="space-y-2">
      <GlassInput type="email" placeholder="email@kamu.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full" />
      <label className="flex items-start gap-2 text-[10px] g-t4">
        <input type="checkbox" required /> Setuju email disimpan sesuai <a href="/privasi" className="underline">Kebijakan Privasi</a>.
      </label>
      <button onClick={submit} disabled={state === "loading"} className="w-full h-9 rounded-[8px] text-sm font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#7c84f8)" }}>
        {state === "loading" ? "..." : "Daftar waitlist"}
      </button>
      {state === "error" && <p className="text-[11px] text-red-400">{msg}</p>}
    </div>
  );
}
