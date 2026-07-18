import { CONTENT } from "@/lib/content";

export function Hero() {
  return (
    <section className="px-5 py-16 md:py-24 max-w-3xl mx-auto w-full text-center">
      <p className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-wide g-t4 mb-3">
        <img src="/3dpb.png" alt="Logo 3D Printing Bandung" width={28} height={32} />
        {CONTENT.poweredBy}
      </p>
      <h1 className="text-3xl md:text-5xl font-bold g-t1 leading-tight">{CONTENT.heroHeadline}</h1>
      <p className="text-base md:text-lg g-t3 mt-4">{CONTENT.heroSub}</p>
      <a
        href="#teaser"
        className="inline-block mt-8 h-11 px-6 rounded-[10px] text-sm font-semibold text-white leading-[44px]"
        style={{ background: "linear-gradient(135deg,#5055e8,#7c84f8)" }}
      >
        Coba kalkulator gratis
      </a>
    </section>
  );
}
