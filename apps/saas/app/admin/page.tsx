import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { getAllConfig } from "@/lib/config";
import { fetchWaitlist, type WaitlistRow } from "@/lib/waitlist/cloudflare";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { WaitlistTable } from "@/components/admin/WaitlistTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) redirect("/");

  const config = await getAllConfig();
  let rows: WaitlistRow[] = [];
  let waitlistError: string | null = null;
  try {
    rows = await fetchWaitlist();
  } catch (e) {
    waitlistError = (e as Error).message;
  }

  return (
    <main className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold g-t1">Admin Slizebiz</h1>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Harga & copy (Config)</h2>
        <ConfigEditor initial={config} />
      </section>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Waitlist ({rows.length})</h2>
        {waitlistError
          ? <p className="text-[12px]" style={{ color: "#dc2626" }}>Gagal baca waitlist: {waitlistError}</p>
          : <WaitlistTable rows={rows} />}
      </section>
    </main>
  );
}
