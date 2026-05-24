import { createClient } from '@sanity/client'

const projectId = process.env.SANITY_PROJECT_ID!
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
