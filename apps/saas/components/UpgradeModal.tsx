"use client";
export function UpgradeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="modal-surface rounded-[16px] p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold g-t1 mb-1">Fitur Beli — segera hadir</div>
        <p className="text-[12px] g-t4 mb-3">Simpan hasil, multi-plate, labor & settings custom, master harga akan tersedia di paket Beli. Kami umumkan saat rilis.</p>
        <button className="g-btn-ghost rounded-[10px] px-4 h-9 text-sm w-full" onClick={onClose}>Tutup</button>
      </div>
    </div>
  );
}
