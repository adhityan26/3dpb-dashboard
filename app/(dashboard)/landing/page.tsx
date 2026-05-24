"use client"

import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { CMSSidebar } from "@/components/cms/CMSSidebar"
import { SiteSettingsEditor } from "@/components/cms/SiteSettingsEditor"
import { GalleryManager } from "@/components/cms/GalleryManager"
import { TestimonialsManager } from "@/components/cms/TestimonialsManager"
import { FAQManager } from "@/components/cms/FAQManager"
import { StravaOrdersManager } from "@/components/cms/StravaOrdersManager"
import { WaitlistViewer } from "@/components/cms/WaitlistViewer"
import { GeneratorEditor } from "@/components/cms/GeneratorEditor"
import { FaceshellEditor } from "@/components/cms/FaceshellEditor"

type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"

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
  const validSections: CmsSection[] = ["site-settings", "gallery", "testimonials", "faq", "strava-orders", "waitlist", "generator", "faceshell"]
  const activeSection: CmsSection = validSections.includes(rawSection as CmsSection) ? (rawSection as CmsSection) : "site-settings"

  function setSection(section: CmsSection) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("section", section)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex min-h-screen -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <CMSSidebar active={activeSection} onChange={setSection} />
      <div className="flex-1 overflow-auto">
        {activeSection === "site-settings"  && <SiteSettingsEditor />}
        {activeSection === "gallery"         && <GalleryManager />}
        {activeSection === "testimonials"    && <TestimonialsManager />}
        {activeSection === "faq"             && <FAQManager />}
        {activeSection === "strava-orders"   && <StravaOrdersManager />}
        {activeSection === "waitlist"        && <WaitlistViewer />}
        {activeSection === "generator"       && <GeneratorEditor />}
        {activeSection === "faceshell"       && <FaceshellEditor />}
      </div>
    </div>
  )
}
