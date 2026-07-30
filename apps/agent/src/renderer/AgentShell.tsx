import type { ReactNode } from "react";
import { GlassCard } from "@3pb/ui";

export function AgentShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-glass-page min-h-screen flex flex-col items-center justify-center p-6">
      <img src="/logo.svg" alt="Slizebiz" className="h-8 mb-6" />
      <GlassCard className="w-full max-w-xl p-6">{children}</GlassCard>
    </div>
  );
}
