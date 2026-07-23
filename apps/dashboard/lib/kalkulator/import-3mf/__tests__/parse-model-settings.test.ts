import { describe, it, expect } from "vitest"
import { parseModelSettingsPlates } from "../parse-model-settings"

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="100">
    <metadata key="name" value="Assembly"/>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="plate-1"/>
    <metadata key="locked" value="false"/>
    <model_instance>
      <metadata key="object_id" value="100"/>
      <metadata key="identify_id" value="7038"/>
    </model_instance>
    <model_instance>
      <metadata key="object_id" value="101"/>
      <metadata key="identify_id" value="7329"/>
    </model_instance>
  </plate>
  <plate>
    <metadata key="plater_id" value="2"/>
    <metadata key="plater_name" value=""/>
    <model_instance>
      <metadata key="object_id" value="102"/>
      <metadata key="identify_id" value="7198"/>
    </model_instance>
  </plate>
</config>`

describe("parseModelSettingsPlates", () => {
  it("parses plater_id, plater_name, and counts <model_instance> per plate", () => {
    const plates = parseModelSettingsPlates(XML)
    expect(plates).toEqual([
      { platerId: 1, platerName: "plate-1", objectCount: 2 },
      { platerId: 2, platerName: "", objectCount: 1 },
    ])
  })

  it("returns [] for garbage input", () => {
    expect(parseModelSettingsPlates("not xml")).toEqual([])
  })
})
