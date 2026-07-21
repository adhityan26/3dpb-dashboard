"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { GlassButton } from "@3pb/ui";
import { compressImage } from "@/lib/image/compress";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
type Invoice = { id: string; amount: number; qrPayload: string; displayPrice: number };

export function BeliCheckout({ displayPrice, refundCopy }: { displayPrice: string; refundCopy: string }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [qrSrc, setQrSrc] = useState("");
  const [msg, setMsg] = useState("");
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (inv?.qrPayload) QRCode.toDataURL(inv.qrPayload, { width: 240 }).then(setQrSrc).catch(() => {});
  }, [inv?.qrPayload]);

  async function beli() {
    setPending(true); setMsg("");
    const res = await fetch("/api/beli/checkout", { method: "POST" });
    setPending(false);
    const data = await res.json().catch(() => ({}));
    if (data.owned) { setMsg("Kamu sudah punya akses Pro."); return; }
    if (res.status === 503) { setMsg("Pembayaran belum aktif. Coba lagi nanti."); return; }
    if (!res.ok) { setMsg("Gagal membuat invoice."); return; }
    setInv(data);
  }

  async function sudahBayar() {
    if (!inv || !file) return;
    setPending(true);
    setMsg("");
    try {
      const blob = await compressImage(file);
      const form = new FormData();
      form.append("bukti", new File([blob], "bukti.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/beli/${inv.id}/mark-paid`, { method: "POST", body: form });
      if (res.ok) setPaid(true);
      else if (res.status === 503) setMsg("Upload bukti belum aktif. Hubungi admin.");
      else setMsg("Gagal upload bukti, coba lagi.");
    } catch {
      setMsg("Gagal memproses foto, coba lagi.");
    }
    setPending(false);
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
        <>
          <p className="text-[13px] g-t2">Terima kasih! Pembayaran kamu sedang <b>diverifikasi admin</b>. Kamu akan dikabari begitu aktif.</p>
          {inv && <img src={`/api/beli/${inv.id}/proof`} alt="Bukti transfer" className="mt-2 rounded-[10px] max-h-48" />}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[12px] g-t4 text-center">Scan QRIS & transfer <b>TEPAT</b> nominal ini:</p>
          <div className="text-xl font-bold" style={{ color: "var(--g-accent)" }}>{rupiah(inv.amount)}</div>
          {qrSrc && <img src={qrSrc} alt="QRIS" width={240} height={240} />}
          <p className="text-[11px] g-t4">Invoice berlaku 3 jam.</p>
          <label className="text-[12px] g-t3 flex flex-col gap-1">
            Foto bukti transfer (wajib)
            <input type="file" accept="image/*" aria-label="Foto bukti transfer"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[12px] g-t4" />
          </label>
          {file && <p className="text-[11px] g-t4">Terpilih: {file.name}</p>}
          <GlassButton onClick={sudahBayar} disabled={pending || !file} className="w-full">
            {pending ? "Mengunggah…" : "Saya sudah bayar"}
          </GlassButton>
          {!file && <p className="text-[11px] g-t5">Upload foto bukti transfer dulu untuk melanjutkan.</p>}
        </div>
      )}
      {msg && <p className="text-[12px] g-t3">{msg}</p>}
      <p className="text-[11px] g-t5 mt-2">{refundCopy}</p>
    </div>
  );
}
