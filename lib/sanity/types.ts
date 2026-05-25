// Sanity raw localized field shape (from internationalizedArrayString plugin)
export type LocalizedArray = { _key: string; value: string }[]

// Flat shape used in API requests/responses
export type LocalizedValue = { id: string; en: string }

// Sanity image reference
export interface SanityImageRef {
  _type: 'image'
  asset: { _ref: string; _type: 'reference' }
  hotspot?: { x: number; y: number; height: number; width: number }
  crop?: { top: number; bottom: number; left: number; right: number }
  alt?: string
}

// Helpers — convert between Sanity wire format and flat API format
export function toLocalized(input: Partial<LocalizedValue>): LocalizedArray {
  return [
    { _key: 'id', value: input.id ?? '' },
    { _key: 'en', value: input.en ?? '' },
  ]
}

export function fromLocalized(arr: LocalizedArray | undefined): LocalizedValue {
  const out: LocalizedValue = { id: '', en: '' }
  if (!arr) return out
  for (const item of arr) {
    if (item._key === 'id') out.id = item.value ?? ''
    if (item._key === 'en') out.en = item.value ?? ''
  }
  return out
}

// ── Domain types (API response shapes) ──────────────────────────

export interface GalleryItem {
  _id: string
  title: LocalizedValue
  imageUrl: string | null
  imageRef: string | null  // Sanity asset _ref for updates
  alt: string
  category: 'custom' | 'cosplay' | 'print-service' | 'showcase'
  caption: LocalizedValue
  order: number
}

export interface Testimonial {
  _id: string
  name: string
  text: string
  imageUrl: string | null
  imageRef: string | null
  tags: string[]
  order: number
}

export interface FaqItem {
  _id: string
  question: LocalizedValue
  answer: LocalizedValue
  tags: string[]
  order: number
}

export interface StravaOrder {
  _id: string
  name: string
  whatsapp: string
  stravaUrl: string
  notes: string | null
  submittedAt: string
  size: 'small' | 'medium' | 'large'
  shape: 'square' | 'rectangle' | 'circle' | 'hexagon'
  enabledLayers: string[]
  colors: Record<string, string>
  status: 'new' | 'in-progress' | 'done' | 'cancelled'
  adminNotes: string | null
}

export interface WaitlistEntry {
  _id: string
  email: string
  name: string | null
  submittedAt: string
  source: string
}

export interface SiteSettings {
  brandName: string
  tagline: LocalizedValue
  contact: {
    whatsapp: string
    instagram: string
    email: string
    address: LocalizedValue
    operatingHours: LocalizedValue
  }
  marketplaceLinks: {
    shopee: string
    tokopedia: string
    tiktokShop: string
  }
  seo: {
    defaultTitle: LocalizedValue
    defaultDescription: LocalizedValue
  }
}

export interface GeneratorSettings {
  headline: LocalizedValue
  description: LocalizedValue
  launchStatus: 'coming-soon' | 'beta' | 'live'
  estimatedLaunch: string
  orderUrl: string
  orderLabel: LocalizedValue
  devScreenshots: { imageUrl: string; imageRef: string; alt: string }[]
}

export interface FaceshellSettings {
  headline: LocalizedValue
  description: LocalizedValue
  orderWhatsappMessage: string
  externalMeasurementUrl: string
  externalMeasurementLabel: LocalizedValue
  items: {
    _key: string
    imageUrl: string | null
    imageRef: string | null
    alt: string
    title: LocalizedValue
    caption: LocalizedValue
  }[]
}

// Sidebar counts shape
export interface CmsCounts {
  gallery: number
  testimonials: number
  faq: number
  stravaOrdersNew: number
  waitlist: number
  lgOrdersPending: number
}
