"use client";
import { useEffect, useState } from "react";

type SerwistLike = { messageSkipWaiting: () => void };

export function UpdateBanner() {
  const [waiting, setWaiting] = useState(false);
  const [serwist, setSerwist] = useState<SerwistLike | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    import("@serwist/window").then(({ Serwist }) => {
      if (cancelled) return;
      const sw = new Serwist("/sw.js");
      sw.addEventListener("waiting", () => setWaiting(true));
      sw.addEventListener("controlling", () => window.location.reload());
      sw.register();
      setSerwist(sw);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-3 py-2 px-4 text-[13px]"
      style={{ background: "var(--g-accent)", color: "#fff" }}
    >
      <span>Update tersedia — refresh?</span>
      <button
        type="button"
        onClick={() => serwist?.messageSkipWaiting()}
        className="px-3 py-1 rounded-[5px] text-[12px] font-medium"
        style={{ background: "rgba(255,255,255,0.2)" }}
      >
        Refresh
      </button>
    </div>
  );
}
