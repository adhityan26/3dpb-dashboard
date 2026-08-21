import { downloadFromMinio } from "@/lib/lg-storage"
import type { FlooringImage } from "@/lib/stl-service"

/** Thrown when an order requests a custom flooring shape but has no uploaded image. */
export class MissingFlooringImageError extends Error {
  constructor() {
    super("Order tidak punya gambar flooring — upload dulu di editor")
    this.name = "MissingFlooringImageError"
  }
}

/**
 * If the effective config selects `flooring_shape: "custom"`, download the
 * order's floor-insert image from MinIO and return it as a FlooringImage —
 * the STL service overrides flooring_shape server-side once it receives the
 * upload, so the literal "custom" string (which the generator doesn't
 * understand) is stripped from the config sent onward.
 *
 * Throws MissingFlooringImageError if flooring_shape is "custom" but the
 * order has no additionalImagePath.
 */
export async function resolveFlooringImage(
  configJson: object,
  additionalImagePath: string | null,
): Promise<{ config: object; flooringImage?: FlooringImage }> {
  const config = configJson as Record<string, unknown>
  if (config.flooring_shape !== "custom") {
    return { config: configJson }
  }

  if (!additionalImagePath) {
    throw new MissingFlooringImageError()
  }

  const buffer = await downloadFromMinio(additionalImagePath)
  const filename = additionalImagePath.split("/").pop() ?? "flooring.png"

  // Omit flooring_shape — the STL service route overrides it with the
  // uploaded flooring_image file anyway, and "custom" would fail GeneratorConfig
  // validation (it's not a recognized keyword) if sent through as-is.
  const { flooring_shape: _omit, ...rest } = config
  void _omit

  return { config: rest, flooringImage: { buffer, filename } }
}
