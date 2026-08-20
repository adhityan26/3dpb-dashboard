import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export interface PlateFilament {
  id: number;
  color: string;
  type: string;
  amsSlot: number;
}

export interface PlateInfo {
  index: number;
  filaments: PlateFilament[];
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

interface RawFilament {
  id: string;
  color: string;
  type: string;
}

interface RawMetadata {
  key: string;
  value: string;
}

interface RawPlate {
  metadata?: RawMetadata | RawMetadata[];
  filament?: RawFilament | RawFilament[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePlate(raw: RawPlate, fallbackIndex: number): PlateInfo {
  const metadata = toArray(raw.metadata);
  const indexMeta = metadata.find((m) => m.key === "index");
  const index = indexMeta ? Number(indexMeta.value) : fallbackIndex;

  const filamentMapsMeta = metadata.find((m) => m.key === "filament_maps");
  const amsSlots = filamentMapsMeta ? filamentMapsMeta.value.trim().split(/\s+/).map(Number) : [];

  const filaments = toArray(raw.filament).map((f, i) => ({
    id: Number(f.id),
    color: f.color,
    type: f.type,
    amsSlot: amsSlots[i] ?? 1,
  }));

  return { index, filaments };
}

export async function parseThreemf(buffer: Buffer): Promise<PlateInfo[]> {
  const zip = await JSZip.loadAsync(buffer);
  const sliceInfoFile = zip.file("Metadata/slice_info.config");
  if (!sliceInfoFile) {
    throw new Error("not_bambu_3mf");
  }

  const xml = await sliceInfoFile.async("string");
  const parsed = xmlParser.parse(xml) as { config?: { plate?: RawPlate | RawPlate[] } };
  const rawPlates = toArray(parsed.config?.plate);

  return rawPlates.map((raw, i) => parsePlate(raw, i + 1));
}
