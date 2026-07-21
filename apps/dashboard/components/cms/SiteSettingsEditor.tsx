"use client"

import { useState, useEffect } from "react"
import { useSiteSettings, usePatchSiteSettings } from "@/lib/hooks/use-cms"
import { LocalizedField } from "./shared/LocalizedField"
import type { LocalizedValue } from "@/lib/sanity/types"

const EMPTY_LOC: LocalizedValue = { id: "", en: "" }

export function SiteSettingsEditor() {
  const { data, isLoading } = useSiteSettings()
  const patch = usePatchSiteSettings()
  const [form, setForm] = useState<typeof data | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (data && !form) setForm(data) }, [data, form])

  if (isLoading || !form) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  async function handleSave() {
    if (!form) return
    await patch.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function setContact(field: string, val: string | LocalizedValue) {
    setForm((f) => f ? { ...f, contact: { ...f.contact, [field]: val } } : f)
  }
  function setMarketplace(field: string, val: string) {
    setForm((f) => f ? { ...f, marketplaceLinks: { ...f.marketplaceLinks, [field]: val } } : f)
  }
  function setSeo(field: string, val: LocalizedValue) {
    setForm((f) => f ? { ...f, seo: { ...f.seo, [field]: val } } : f)
  }

  const inputClass = "w-full bg-white/[0.04] border border-white/10 rounded-[8px] px-3 py-2 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-indigo-500/60"
  const sectionClass = "space-y-4 pb-6 border-b border-white/6"

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-[15px] font-bold text-white">⚙️ Site Settings</h2>
        <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Brand info, kontak, marketplace links, SEO</p>
      </div>

      <div className={sectionClass}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>Brand</h3>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>Brand Name</label>
          <input className={inputClass} value={form.brandName ?? ""} onChange={(e) => setForm((f) => f ? { ...f, brandName: e.target.value } : f)} />
        </div>
        <LocalizedField label="Tagline" value={form.tagline ?? EMPTY_LOC} onChange={(v) => setForm((f) => f ? { ...f, tagline: v } : f)} />
      </div>

      <div className={sectionClass}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>Kontak</h3>
        {(["whatsapp", "instagram", "email"] as const).map((field) => (
          <div key={field}>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>{field}</label>
            <input className={inputClass} value={(form.contact[field] as string) ?? ""} onChange={(e) => setContact(field, e.target.value)} />
          </div>
        ))}
        <LocalizedField label="Alamat" value={form.contact.address ?? EMPTY_LOC} onChange={(v) => setContact("address", v)} multiline />
        <LocalizedField label="Jam Operasional" value={form.contact.operatingHours ?? EMPTY_LOC} onChange={(v) => setContact("operatingHours", v)} />
      </div>

      <div className={sectionClass}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>Marketplace Links</h3>
        {(["shopee", "tokopedia", "tiktokShop"] as const).map((field) => (
          <div key={field}>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(165,180,252,0.6)" }}>{field}</label>
            <input className={inputClass} value={(form.marketplaceLinks as Record<string, string>)[field] ?? ""} onChange={(e) => setMarketplace(field, e.target.value)} placeholder="https://" />
          </div>
        ))}
      </div>

      <div className={sectionClass}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(165,180,252,0.7)" }}>SEO</h3>
        <LocalizedField label="Title" value={form.seo?.defaultTitle ?? EMPTY_LOC} onChange={(v) => setSeo("defaultTitle", v)} />
        <LocalizedField label="Description" value={form.seo?.defaultDescription ?? EMPTY_LOC} onChange={(v) => setSeo("defaultDescription", v)} multiline />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={patch.isPending}
          className="px-5 py-2 rounded-[8px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#5055e8,#818cf8)" }}
        >
          {patch.isPending ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
        {saved && <span className="text-[12px]" style={{ color: "rgba(74,222,128,0.8)" }}>✓ Tersimpan</span>}
        {patch.isError && <span className="text-[12px] text-red-400">{patch.error?.message}</span>}
      </div>
    </div>
  )
}
