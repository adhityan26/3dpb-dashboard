"use client"

import { Suspense, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { CMSSidebar } from "@/components/cms/CMSSidebar"
import { SidebarDrawerShell } from "@/components/layout/SidebarDrawerShell"
import { PageShell } from "@/components/layout/PageShell"
import { SiteSettingsEditor } from "@/components/cms/SiteSettingsEditor"
import { GalleryManager } from "@/components/cms/GalleryManager"
import { TestimonialsManager } from "@/components/cms/TestimonialsManager"
import { FAQManager } from "@/components/cms/FAQManager"
import { StravaOrdersManager } from "@/components/cms/StravaOrdersManager"
import { WaitlistViewer } from "@/components/cms/WaitlistViewer"
import { GeneratorEditor } from "@/components/cms/GeneratorEditor"
import { FaceshellEditor } from "@/components/cms/FaceshellEditor"
import { LgOrdersManager } from "@/components/cms/LgOrdersManager"
import { KeycapOrdersManager } from "@/components/cms/KeycapOrdersManager"

type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"
  | "lg-orders" | "keycap-orders"

/** Judul PageShell mengikuti section aktif, supaya selalu menggambarkan yang dilihat. */
const SECTION_HEADING: Record<CmsSection, string> = {
  "site-settings":  "Site Settings",
  "gallery":        "Galeri",
  "testimonials":   "Testimoni",
  "faq":            "FAQ",
  "strava-orders":  "Strava Orders",
  "waitlist":       "Waitlist",
  "generator":      "Generator",
  "faceshell":      "Faceshell",
  "lg-orders":      "LG Orders",
  "keycap-orders":  "Keycap Orders",
}

export default function LandingPage() {
  return (
    <Suspense>
      <LandingPageInner />
    </Suspense>
  )
}

function LandingPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const rawSection = searchParams.get("section") ?? "site-settings"
  const validSections: CmsSection[] = ["site-settings", "gallery", "testimonials", "faq", "strava-orders", "waitlist", "generator", "faceshell", "lg-orders", "keycap-orders"]
  const activeSection: CmsSection = validSections.includes(rawSection as CmsSection) ? (rawSection as CmsSection) : "site-settings"
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function setSection(section: CmsSection) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("section", section)
    router.replace(`?${params.toString()}`, { scroll: false })
    setSidebarOpen(false)
  }

  return (
    <div className="flex min-h-screen -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <SidebarDrawerShell
        open={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      >
        <CMSSidebar active={activeSection} onChange={setSection} />
      </SidebarDrawerShell>
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <PageShell
          title={SECTION_HEADING[activeSection]}
          description="Kelola konten situs marketing Slizebiz."
        >
        {activeSection === "site-settings"  && <SiteSettingsEditor />}
        {activeSection === "gallery"         && <GalleryManager />}
        {activeSection === "testimonials"    && <TestimonialsManager />}
        {activeSection === "faq"             && <FAQManager />}
        {activeSection === "strava-orders"   && <StravaOrdersManager />}
        {activeSection === "waitlist"        && <WaitlistViewer />}
        {activeSection === "generator"       && <GeneratorEditor />}
        {activeSection === "faceshell"       && <FaceshellEditor />}
        {activeSection === "lg-orders"       && <LgOrdersManager />}
        {activeSection === "keycap-orders"   && <KeycapOrdersManager />}
        </PageShell>
      </div>
    </div>
  )
}
