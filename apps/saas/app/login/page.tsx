"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { GlassButton, GlassInput } from "@3pb/ui";
import { detectChannel } from "@/lib/wa/normalize";

type Step = "idle" | "email_sent" | "wa_code";

export default function LoginPage() {
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(""); setPending(true);
    const channel = detectChannel(input);
    if (channel === "email") {
      await signIn("resend", { email: input.trim(), redirect: false, callbackUrl: "/" });
      setStep("email_sent"); setPending(false); return;
    }
    if (channel === "phone") {
      const res = await fetch("/api/auth/wa/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      setPending(false);
      if (res.ok) { setStep("wa_code"); return; }
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) setMsg("Login WhatsApp belum aktif, pakai email dulu.");
      else if (res.status === 429) setMsg(`Terlalu sering, tunggu ${data.waitSec ?? 60} detik.`);
      else if (res.status === 502) setMsg("Gagal kirim kode via WhatsApp, coba lagi.");
      else setMsg("Nomor tidak valid.");
      return;
    }
    setPending(false);
    setMsg("Masukkan email (ada @) atau nomor WhatsApp (08…/+62…).");
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setMsg(""); setPending(true);
    const res = await fetch("/api/auth/wa/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, code }),
    });
    setPending(false);
    // SENGAJA reload penuh, bukan router.push: sesi baru saja dibuat lewat cookie
    // dari route WA OTP, dan server component perlu membacanya dari awal.
    if (res.ok) { window.location.href = "/"; return; }
    const data = await res.json().catch(() => ({}));
    if (data.error === "expired") setMsg("Kode kadaluarsa. Kirim ulang.");
    else if (data.error === "locked") setMsg("Terlalu banyak percobaan. Kirim ulang kode.");
    else setMsg("Kode salah, coba lagi.");
  }

  return (
    <main className="max-w-sm mx-auto p-6 mt-16">
      <img src="/logo.svg" alt="Slizebiz" width={44} height={44} className="mb-3" />
      <h1 className="text-lg font-semibold g-t1 mb-1">Masuk Slizebiz</h1>
      <p className="text-[12px] g-t4 mb-4">Tanpa password.</p>

      {step === "idle" && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <GlassInput value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Email atau nomor WhatsApp" required />
          <GlassButton type="submit" disabled={pending}>{pending ? "Memproses…" : "Lanjut"}</GlassButton>
        </form>
      )}

      {step === "email_sent" && (
        <p className="text-[13px] g-t2">Link masuk dikirim ke <b>{input}</b>. Cek inbox/spam.</p>
      )}

      {step === "wa_code" && (
        <form onSubmit={onVerify} className="flex flex-col gap-3">
          <p className="text-[12px] g-t4">Kode dikirim via WhatsApp ke {input}. Masukkan 6 digit:</p>
          <GlassInput value={code} onChange={(e) => setCode(e.target.value)}
            inputMode="numeric" maxLength={6} placeholder="123456" required />
          <GlassButton type="submit" disabled={pending}>{pending ? "Memverifikasi…" : "Verifikasi"}</GlassButton>
          <button type="button" className="text-[12px] g-t4 underline"
            onClick={() => { setStep("idle"); setCode(""); setMsg(""); }}>Kirim ulang / ganti nomor</button>
        </form>
      )}

      {msg && <p className="text-[12px] mt-3" style={{ color: "#dc2626" }}>{msg}</p>}
    </main>
  );
}
