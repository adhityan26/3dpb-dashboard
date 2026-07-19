"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { GlassButton } from "@3pb/ui";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
type Invoice = { id: string; amount: number; qrPayload: string; displayPrice: number };

export function BeliCheckout({ displayPrice, refundCopy }: { displayPrice: string; refundCopy: string }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [qrSrc, setQrSrc] = useState("");
  const [msg, setMsg] = useState("");
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (inv?.qrPayload) QRCode.toDataURL(inv.qrPayload, { width: 240 }).then(setQrSrc).catch(() => {});
  }, [inv?.qrPayload]);

  async function beli() {
    setPending(true); setMsg("");
    const res = await fetch("/api/beli/checkout", { method: "POST" });
    setPending(false);
    const data = await res.json().catch(() => ({}));
    if (data.owned) { setMsg("Kamu sudah punya akses."); return; }
    if (res.status === 503) { setMsg("Pembayaran belum aktif. Coba lagi nanti."); return; }
    if (!res.ok) { setMsg("Gagal membuat invoice."); return; }
    setInv(data);
  }

  async function sudahBayar() {
    if (!inv) return;
    setPending(true);
    const res = await fetch(`/api/beli/${inv.id}/mark-paid`, { method: "POST" });
    setPending(false);
    if (res.ok) setPaid(true);
  }

  const priceNum = Number(displayPrice);
  return (
    <div className="flex flex-col gap-3 mt-2">
      {!inv ? (
        !priceNum || priceNum <= 0 ? (
          <p className="text-[13px] g-t3">Pembayaran belum diaktifkan admin. Coba lagi nanti.</p>
        ) : (
        <>
          <p className="text-[13px] g-t2">Bayar sekali, akses selamanya — <b>{rupiah(priceNum)}</b></p>
          <GlassButton onClick={beli} disabled={pending}>{pending ? "Memproses…" : "Beli sekarang"}</GlassButton>
        </>
        )
      ) : paid ? (
        <p className="text-[13px] g-t2">Terima kasih! Pembayaran kamu sedang <b>diverifikasi admin</b>. Kamu akan dikabari begitu aktif.</p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[12px] g-t4 text-center">Scan QRIS & transfer <b>TEPAT</b> nominal ini:</p>
          <div className="text-xl font-bold" style={{ color: "var(--g-accent)" }}>{rupiah(inv.amount)}</div>
          {qrSrc && <img src={qrSrc} alt="QRIS" width={240} height={240} />}
          <p className="text-[11px] g-t4">Invoice berlaku 3 jam.</p>
          <GlassButton onClick={sudahBayar} disabled={pending} className="w-full">{pending ? "…" : "Saya sudah bayar"}</GlassButton>
        </div>
      )}
      {msg && <p className="text-[12px] g-t3">{msg}</p>}
      <p className="text-[11px] g-t5 mt-2">{refundCopy}</p>
    </div>
  );
}
