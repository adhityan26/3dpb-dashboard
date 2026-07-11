'use client'

import { PrinterProfilesSection } from './PrinterProfilesSection'
import { MaterialProfilesSection } from './MaterialProfilesSection'
import { KomponenPresetsSection } from './KomponenPresetsSection'

export function KalkulatorV2SettingsCard() {
  return (
    <div className="rounded-[16px] p-5 space-y-6 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🧮 Kalkulator v2 — Profiles &amp; Presets</div>
        <div className="text-xs mt-0.5 g-t4">
          Printer, material, komponen, labor, dan channel — dipakai kalkulator HPP v2
        </div>
      </div>
      <PrinterProfilesSection />
      <MaterialProfilesSection />
      <KomponenPresetsSection />
      {/* SECTION_LABOR */}
      {/* SECTION_CHANNEL */}
    </div>
  )
}
