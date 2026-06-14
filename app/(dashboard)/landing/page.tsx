"use client"

import { Suspense, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { CMSSidebar } from "@/components/cms/CMSSidebar"
import { SidebarDrawerShell } from "@/components/layout/SidebarDrawerShell"
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
  const validSections: CmsSection[] = ["site-settings", "gallery", "testimonials", "faq", "strava-orders", "waitlist", "generator", "faceshell", "lg-orders"]
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
      <div className="flex-1 overflow-auto">
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
      </div>
    </div>
  )
}
