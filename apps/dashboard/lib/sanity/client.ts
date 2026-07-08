import { createClient } from '@sanity/client'

// Fallback 'placeholder' prevents build-time crash when env var is not injected during `docker build`.
// At runtime the real value is always present (passed via docker run -e).
const projectId = process.env.SANITY_PROJECT_ID || 'placeholder'
const dataset = process.env.SANITY_DATASET ?? 'production'
const apiVersion = process.env.SANITY_API_VERSION ?? '2024-10-01'

// Read-only client — uses CDN, no token
export const sanityRead = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  perspective: 'published',
})

// Write client — uses write token, bypasses CDN
export const sanityWrite = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_WRITE_TOKEN,
  perspective: 'published',
})
