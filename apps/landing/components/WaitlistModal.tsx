"use client";
import { WaitlistForm } from "./WaitlistForm";
export function WaitlistModal({ interest, onClose }: { interest: "beli" | "subscribe"; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="glass-card rounded-[16px] p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-semibold g-t1 mb-1">Beri tahu saya saat rilis</div>
        <p className="text-[11px] g-t4 mb-3">Minat: {interest === "beli" ? "Beli (miliki app)" : "Subscribe (cloud)"}. Kami email saat fitur ini rilis.</p>
        <WaitlistForm interest={interest} onDone={() => setTimeout(onClose, 1500)} />
      </div>
    </div>
  );
}
