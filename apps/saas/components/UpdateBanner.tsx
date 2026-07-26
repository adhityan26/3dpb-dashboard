"use client";
import { useEffect, useState } from "react";

type SerwistLike = { messageSkipWaiting: () => void };
type ControllingEvent = { isUpdate?: boolean };

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
      // `isUpdate` is false on a brand-new registration (no prior controller) and
      // true only when a service worker was already controlling the page when we
      // registered — i.e. a genuine update just took over via messageSkipWaiting().
      // Without this guard, clientsClaim:true fires "controlling" on EVERY first-ever
      // visit too, silently reloading users who never asked for it (found in final
      // whole-branch review).
      sw.addEventListener("controlling", (event: ControllingEvent) => {
        if (event.isUpdate) window.location.reload();
      });
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
