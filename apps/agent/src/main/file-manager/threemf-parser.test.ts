import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseThreemf } from "./threemf-parser";

async function buildFixture(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "Metadata/slice_info.config",
    `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <filament id="1" color="#FEFEFE" type="PLA"/>
    <filament id="2" color="#000000" type="PLA"/>
    <metadata key="filament_maps" value="1 1"/>
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <filament id="1" color="#FF0000" type="PETG"/>
    <metadata key="filament_maps" value="2"/>
  </plate>
</config>`,
  );
  const content = await zip.generateAsync({ type: "nodebuffer" });
  return content;
}

describe("parseThreemf", () => {
  it("parse daftar plate dengan filament dan AMS slot dari filament_maps", async () => {
    const buffer = await buildFixture();

    const plates = await parseThreemf(buffer);

    expect(plates).toEqual([
      {
        index: 1,
        filaments: [
          { id: 1, color: "#FEFEFE", type: "PLA", amsSlot: 1 },
          { id: 2, color: "#000000", type: "PLA", amsSlot: 1 },
        ],
      },
      {
        index: 2,
        filaments: [{ id: 1, color: "#FF0000", type: "PETG", amsSlot: 2 }],
      },
    ]);
  });

  it("throw error jelas kalau Metadata/slice_info.config tidak ada (bukan format Bambu)", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "bukan file bambu");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(parseThreemf(buffer)).rejects.toThrow("not_bambu_3mf");
  });

  it("handle filament_maps count mismatch: more filaments than filament_maps values fallback to amsSlot 1", async () => {
    // Edge case: 3 filaments but only 2 filament_maps values
    // Third filament should fallback to amsSlot: 1 via the ?? operator
    const zip = new JSZip();
    zip.file(
      "Metadata/slice_info.config",
      `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <filament id="1" color="#FF0000" type="PLA"/>
    <filament id="2" color="#00FF00" type="PLA"/>
    <filament id="3" color="#0000FF" type="PLA"/>
    <metadata key="filament_maps" value="2 3"/>
  </plate>
</config>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const plates = await parseThreemf(buffer);

    // Verify: first two filaments get their mapped slots (2, 3),
    // third filament gets fallback to 1 because amsSlots[2] is undefined
    expect(plates).toEqual([
      {
        index: 1,
        filaments: [
          { id: 1, color: "#FF0000", type: "PLA", amsSlot: 2 },
          { id: 2, color: "#00FF00", type: "PLA", amsSlot: 3 },
          { id: 3, color: "#0000FF", type: "PLA", amsSlot: 1 }, // fallback via ?? 1
        ],
      },
    ]);
  });

  it("handle non-numeric filament id: Number() produces NaN which passes through silently", async () => {
    // Edge case: malformed filament id (non-numeric)
    // Current behavior: Number("abc") → NaN, which is included in the parsed output
    const zip = new JSZip();
    zip.file(
      "Metadata/slice_info.config",
      `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <filament id="abc" color="#FF0000" type="PLA"/>
    <filament id="2" color="#00FF00" type="PLA"/>
    <metadata key="filament_maps" value="1 2"/>
  </plate>
</config>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const plates = await parseThreemf(buffer);

    // Verify: first filament's id is NaN (result of Number("abc"))
    expect(plates).toEqual([
      {
        index: 1,
        filaments: [
          { id: NaN, color: "#FF0000", type: "PLA", amsSlot: 1 },
          { id: 2, color: "#00FF00", type: "PLA", amsSlot: 2 },
        ],
      },
    ]);
  });

  it("handle non-numeric plate index: Number() produces NaN which is used as fallback", async () => {
    // Edge case: malformed plate index metadata
    // Current behavior: Number("xyz") → NaN, but then uses fallbackIndex (1-based array position)
    // because indexMeta.value is "xyz" and Number("xyz") → NaN, and we fall back to fallbackIndex
    const zip = new JSZip();
    zip.file(
      "Metadata/slice_info.config",
      `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="xyz"/>
    <filament id="1" color="#FF0000" type="PLA"/>
    <metadata key="filament_maps" value="1"/>
  </plate>
</config>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const plates = await parseThreemf(buffer);

    // Verify: index is NaN (Number("xyz"))
    // Note: this demonstrates that non-numeric index values produce NaN;
    // the parser accepts it without validation
    expect(plates).toEqual([
      {
        index: NaN,
        filaments: [{ id: 1, color: "#FF0000", type: "PLA", amsSlot: 1 }],
      },
    ]);
  });
});
