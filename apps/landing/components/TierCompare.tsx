import { GlassCard } from "@3pb/ui";
import { TIERS } from "@/lib/content";

export function TierCompare({ onWaitlist }: { onWaitlist: (i: "beli" | "subscribe") => void }) {
  return (
    <section id="harga" className="px-5 py-10 max-w-5xl mx-auto w-full grid gap-4 md:grid-cols-3">
      {TIERS.map((tier) => (
        <GlassCard
          key={tier.id}
          className="p-5 flex flex-col"
          style={tier.highlight ? { border: "1px solid rgba(99,102,241,0.5)" } : undefined}
        >
          <h3 className="text-sm font-semibold g-t1">{tier.nama}</h3>
          <div className="text-2xl font-bold g-t1 mt-1">{tier.harga}</div>
          <ul className="mt-3 space-y-1 flex-1">
            {tier.fitur.map((f) => (
              <li key={f} className="text-xs g-t3">· {f}</li>
            ))}
          </ul>
          {tier.interest && (
            <button
              onClick={() => onWaitlist(tier.interest!)}
              className="mt-4 h-9 rounded-[8px] text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#5055e8,#7c84f8)" }}
            >
              Beri tahu saya saat rilis
            </button>
          )}
        </GlassCard>
      ))}
    </section>
  );
}
