import { describe, it, expect } from "vitest"
import { parseSliceInfo } from "../parse-slice-info"

const SLICED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Version" value="02.07.01.62"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="printer_model_id" value="C12"/>
    <metadata key="prediction" value="19939"/>
    <metadata key="weight" value="114.44"/>
    <object identify_id="7038" name="Assembly" skipped="false" />
    <object identify_id="7329" name="Assembly" skipped="false" />
    <object identify_id="9999" name="Assembly" skipped="true" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="31.76" used_g="96.26" group_id="0"/>
    <filament id="2" tray_info_idx="GFA00" type="PLA" color="#FE7E62" used_m="0.42" used_g="1.28" group_id="0"/>
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="printer_model_id" value="C12"/>
    <metadata key="prediction" value="30867"/>
    <metadata key="weight" value="245.82"/>
    <object identify_id="7198" name="Assembly" skipped="false" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="80.15" used_g="242.90" group_id="0"/>
  </plate>
</config>`

const UNSLICED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Version" value="02.07.01.62"/>
  </header>
</config>`

describe("parseSliceInfo", () => {
  it("parses each <plate> block with metadata, object count (excluding skipped), and filaments", () => {
    const plates = parseSliceInfo(SLICED_XML)
    expect(plates).toHaveLength(2)

    expect(plates[0]).toEqual({
      index: 1,
      weightG: 114.44,
      predictionSec: 19939,
      printerModelId: "C12",
      objectCount: 2, // 3 objects total, 1 skipped="true" excluded
      filaments: [
        { id: 1, type: "PLA", color: "#000000", usedG: 96.26 },
        { id: 2, type: "PLA", color: "#FE7E62", usedG: 1.28 },
      ],
    })
    expect(plates[1].index).toBe(2)
    expect(plates[1].objectCount).toBe(1)
    expect(plates[1].filaments).toHaveLength(1)
  })

  it("returns empty array for a file with no <plate> blocks (unsliced)", () => {
    expect(parseSliceInfo(UNSLICED_XML)).toEqual([])
  })

  it("returns empty array for empty/garbage input", () => {
    expect(parseSliceInfo("")).toEqual([])
    expect(parseSliceInfo("not xml at all")).toEqual([])
  })
})
