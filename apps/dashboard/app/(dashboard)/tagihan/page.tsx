import { PageShell } from "@/components/layout/PageShell"

export default function TagihanPage() {
  return (
    <PageShell
      title="Tagihan"
      description="Modul ini belum tersedia — belum ada implementasi di balik halaman ini."
    >
      <div className="g-card rounded-[5px] p-4">
        <p className="text-sm g-t4">
          Belum ada data tagihan untuk ditampilkan. Untuk sementara, penagihan ke
          buyer dikelola lewat <strong>Finance → Invoice</strong>.
        </p>
      </div>
    </PageShell>
  )
}
