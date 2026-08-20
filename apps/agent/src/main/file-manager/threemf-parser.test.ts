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
});
