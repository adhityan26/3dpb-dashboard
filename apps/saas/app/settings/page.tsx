import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PageShell } from "@/components/PageShell";
import { AgentTokenSection } from "@/components/settings/AgentTokenSection";
import { DownloadAgentSection } from "@/components/settings/DownloadAgentSection";
import { headBinary } from "@/lib/storage/r2";
import { hasActiveSlotGrant } from "@/lib/printer-slots/capacity";

export const dynamic = "force-dynamic";

// Ambil metadata (versi+commit hash) binary win yang lagi ke-host di R2, HEAD-only (tak
// download body ~100MB cuma buat baca versi) -- win & mac selalu dibangun+diupload dari
// commit yang sama tiap siklus staging, jadi cukup satu representatif buat ditampilkan.
// Diam-diam kalau R2 belum dikonfigurasi/error -- bukan bagian kritis halaman Settings.
async function currentAgentBuildId(): Promise<string | null> {
  try {
    const meta = await headBinary("agent/latest/win.exe");
    if (meta?.version && meta?.commitHash) return `${meta.version}+${meta.commitHash}`;
    return null;
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const ent = await getEntitlement(userId);
  const paidCore = capabilities(ent).paidCore;
  // Agent/printer-slot section: paidCore lapse tak boleh menutup akses kalau user masih pegang
  // SlotGrant permanen (beli-slot / CYD) — samakan dengan gate backend requireAgentAccess().
  // Bagian kalkulator Pro (paragraf read-only + SettingsPanel.editable) TETAP pakai paidCore
  // murni — beda kapabilitas, tidak disentuh fix ini.
  const hasAgentAccess = paidCore || (await hasActiveSlotGrant(userId));
  const agentBuildId = hasAgentAccess ? await currentAgentBuildId() : null;
  return (
    <PageShell title="Setting kalkulator" current="setting" owner={isOwner(session?.user?.email)} userLabel={session?.user?.email ?? undefined}>
      {!paidCore && <p className="text-[12px] g-t4 mb-4">Ini nilai default (read-only). Ambil Pro untuk mengubah &amp; memakainya di kalkulatormu.</p>}
      <SettingsPanel editable={paidCore} userId={userId} />
      {hasAgentAccess && (
        <div className="mt-4 flex flex-col gap-4">
          <AgentTokenSection />
          <DownloadAgentSection buildId={agentBuildId} />
        </div>
      )}
    </PageShell>
  );
}
