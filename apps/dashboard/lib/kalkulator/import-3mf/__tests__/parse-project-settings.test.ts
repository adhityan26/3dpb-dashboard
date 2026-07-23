import { describe, it, expect } from "vitest"
import { parseProjectSettingsFilamentSlots } from "../parse-project-settings"

const JSON_TEXT = JSON.stringify({
  filament_vendor: ["Bambu Lab", "Bambu Lab", "eSUN"],
  filament_type: ["PLA", "PLA", "PETG"],
  printer_model: "Bambu Lab P1S",
})

describe("parseProjectSettingsFilamentSlots", () => {
  it("zips filament_vendor[] and filament_type[] into slot objects by index", () => {
    expect(parseProjectSettingsFilamentSlots(JSON_TEXT)).toEqual([
      { vendor: "Bambu Lab", type: "PLA" },
      { vendor: "Bambu Lab", type: "PLA" },
      { vendor: "eSUN", type: "PETG" },
    ])
  })

  it("returns [] when arrays are missing or JSON is invalid", () => {
    expect(parseProjectSettingsFilamentSlots("{}")).toEqual([])
    expect(parseProjectSettingsFilamentSlots("not json")).toEqual([])
  })
})
