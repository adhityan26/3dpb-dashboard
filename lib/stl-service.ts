/**
 * HTTP client for the Python FastAPI STL service
 * (container: light-generator-stl-service-1, port 8001)
 *
 * Endpoints used:
 *   POST /generate         — image + config_json → STL bytes
 *   POST /preview          — image + config_json → PNG bytes
 *   POST /check-islands    — image + config_json → { has_floating_islands: bool }
 */

function getServiceUrl(): string {
  return process.env.STL_SERVICE_URL ?? "http://localhost:8001"
}

function getServiceToken(): string {
  return process.env.STL_SERVICE_TOKEN ?? ""
}

function buildAuthHeaders(): Record<string, string> {
  const token = getServiceToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Build a multipart FormData with an image buffer + JSON config blob. */
function buildFormData(
  imageBuffer: Buffer,
  imageFilename: string,
  configJson: object,
): FormData {
  const form = new FormData()
  const blob = new Blob([new Uint8Array(imageBuffer)])
  form.append("image", blob, imageFilename)
  form.append("config_json", JSON.stringify(configJson))
  return form
}

/** POST image + config to STL service /generate. Returns raw STL bytes. */
export async function stlGenerate(
  imageBuffer: Buffer,
  imageFilename: string,
  config: object,
): Promise<Buffer> {
  const form = buildFormData(imageBuffer, imageFilename, config)
  const res = await fetch(`${getServiceUrl()}/generate`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`STL service /generate error ${res.status}: ${text}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** POST image + config to STL service /preview. Returns raw PNG bytes. */
export async function stlPreview(
  imageBuffer: Buffer,
  imageFilename: string,
  config: object,
): Promise<Buffer> {
  const form = buildFormData(imageBuffer, imageFilename, config)
  const res = await fetch(`${getServiceUrl()}/preview`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`STL service /preview error ${res.status}: ${text}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** POST image + config to STL service /check-islands. */
export async function stlCheckIslands(
  imageBuffer: Buffer,
  imageFilename: string,
  config: object = {},
): Promise<{ has_floating_islands: boolean }> {
  const form = buildFormData(imageBuffer, imageFilename, config)
  const res = await fetch(`${getServiceUrl()}/check-islands`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`STL service /check-islands error ${res.status}: ${text}`)
  }
  return res.json() as Promise<{ has_floating_islands: boolean }>
}
