import { CONTENT } from "@/lib/content";

export function Faq() {
  return (
    <section id="faq" className="px-5 py-10 max-w-3xl mx-auto w-full">
      <h2 className="text-xl font-bold g-t1 mb-4">FAQ</h2>
      <div className="space-y-2">
        {CONTENT.faq.map((item) => (
          <details key={item.q} className="g-card rounded-[10px] p-4">
            <summary className="text-sm font-semibold g-t1 cursor-pointer">{item.q}</summary>
            <p className="text-xs g-t3 mt-2">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
