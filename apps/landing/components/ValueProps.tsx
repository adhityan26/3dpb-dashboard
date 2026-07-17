import { GlassCard } from "@3pb/ui";
import { CONTENT } from "@/lib/content";

export function ValueProps() {
  return (
    <section className="px-5 py-10 max-w-5xl mx-auto w-full grid gap-4 md:grid-cols-3">
      {CONTENT.valueProps.map((v) => (
        <GlassCard key={v.title} className="p-5">
          <div className="text-2xl mb-2">{v.icon}</div>
          <h3 className="text-sm font-semibold g-t1">{v.title}</h3>
          <p className="text-xs g-t3 mt-1">{v.desc}</p>
        </GlassCard>
      ))}
    </section>
  );
}
