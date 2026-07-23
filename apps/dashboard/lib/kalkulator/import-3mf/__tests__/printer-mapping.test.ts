import { describe, it, expect } from "vitest"
import { matchPrinterProfile } from "../printer-mapping"
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"

function profile(id: string, nama: string): PrinterProfileData {
  return {
    id, nama, mesinPerJam: 5000, watt: null, tarifPerKwh: null,
    hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null,
    isDefault: false, isPricingReference: false,
  }
}

describe("matchPrinterProfile", () => {
  it("maps a known printer_model_id (C12=P1S) to a profile whose nama contains the model token", () => {
    const profiles = [profile("pp1", "Bambu Lab P1S"), profile("pp2", "Bambu Lab A1")]
    expect(matchPrinterProfile("C12", profiles)?.id).toBe("pp1")
  })

  it("matches case-insensitively against custom profile names", () => {
    const profiles = [profile("pp1", "Default (p1s)")]
    expect(matchPrinterProfile("C12", profiles)?.id).toBe("pp1")
  })

  it("returns undefined when printer_model_id is unknown", () => {
    const profiles = [profile("pp1", "Bambu Lab P1S")]
    expect(matchPrinterProfile("UNKNOWN_ID", profiles)).toBeUndefined()
  })

  it("returns undefined when no profile matches the token", () => {
    const profiles = [profile("pp1", "Bambu Lab A1")]
    expect(matchPrinterProfile("C12", profiles)).toBeUndefined()
  })

  it("returns undefined when printer_model_id is null", () => {
    expect(matchPrinterProfile(null, [profile("pp1", "Bambu Lab P1S")])).toBeUndefined()
  })
})
