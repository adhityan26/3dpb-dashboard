import { CONTENT, APP_URL } from "@/lib/content";
export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-5 py-4 max-w-5xl mx-auto w-full">
      <span className="font-bold text-lg g-t1">{CONTENT.brand}</span>
      <div className="flex items-center gap-4 text-sm">
        <a href="#harga" className="g-t3 hover:g-t1">Harga</a>
        <a href="#faq" className="g-t3 hover:g-t1">FAQ</a>
        <a href={APP_URL} className="g-btn-ghost rounded-[8px] px-3 py-1.5 text-xs" title="Segera hadir">Masuk <span className="g-t5">· segera</span></a>
      </div>
    </nav>
  );
}
