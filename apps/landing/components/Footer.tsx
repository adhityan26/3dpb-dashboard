import { CONTENT } from "@/lib/content";

export function Footer() {
  return (
    <footer className="px-5 py-8 max-w-5xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-2 text-xs">
      <div className="g-t3">
        <span className="font-semibold g-t1">{CONTENT.brand}</span> · {CONTENT.poweredBy}
      </div>
      <div className="flex items-center gap-4 g-t4">
        <a href="/privasi" className="hover:g-t1">Privasi</a>
        <span title="Segera hadir">Ketentuan <span className="g-t5">· segera</span></span>
        <span title="Segera hadir">Refund <span className="g-t5">· segera</span></span>
        <a href="mailto:halo@slizebiz.com" className="hover:g-t1">Kontak</a>
      </div>
    </footer>
  );
}
