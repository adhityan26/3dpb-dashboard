// Helper macro: flatten internationalizedArrayString/Text to {id, en}
// Usage: loc("fieldName") → inline GROQ projection
const loc = (f: string) =>
  `"${f}": {"id": coalesce(${f}[_key=="id"][0].value,""), "en": coalesce(${f}[_key=="en"][0].value,"")}`

export const Q = {
  siteSettings: `*[_type == "siteSettings"][0]{
    brandName,
    ${loc("tagline")},
    "contact": contact{
      whatsapp, instagram, email,
      ${loc("address")},
      ${loc("operatingHours")}
    },
    marketplaceLinks,
    "seo": seo{
      ${loc("defaultTitle")},
      ${loc("defaultDescription")}
    }
  }`,

  generator: `*[_type == "silhouetteGenerator"][0]{
    ${loc("headline")},
    ${loc("description")},
    launchStatus,
    estimatedLaunch,
    orderUrl,
    ${loc("orderLabel")},
    "devScreenshots": devScreenshots[]{
      "imageUrl": asset->url,
      "imageRef": asset._ref,
      "alt": alt
    }
  }`,

  faceshell: `*[_type == "faceshellCollection"][0]{
    ${loc("headline")},
    ${loc("description")},
    orderWhatsappMessage,
    externalMeasurementUrl,
    ${loc("externalMeasurementLabel")},
    "items": items[]{
      _key,
      "imageUrl": image.asset->url,
      "imageRef": image.asset._ref,
      "alt": image.alt,
      ${loc("title")},
      ${loc("caption")}
    }
  }`,

  gallery: `*[_type == "galleryItem"] | order(order asc){
    _id,
    ${loc("title")},
    "imageUrl": image.asset->url,
    "imageRef": image.asset._ref,
    "alt": image.alt,
    category,
    ${loc("caption")},
    order
  }`,

  testimonials: `*[_type == "testimonial"] | order(order asc){
    _id,
    name,
    text,
    "imageUrl": image.asset->url,
    "imageRef": image.asset._ref,
    tags,
    order
  }`,

  faq: `*[_type == "faq"] | order(order asc){
    _id,
    ${loc("question")},
    ${loc("answer")},
    tags,
    order
  }`,

  stravaOrders: `*[_type == "stravaMapOrder"] | order(submittedAt desc){
    _id,
    name,
    whatsapp,
    stravaUrl,
    notes,
    submittedAt,
    size,
    shape,
    enabledLayers,
    colors,
    status,
    adminNotes
  }`,

  waitlist: `*[_type == "waitlistEntry"] | order(submittedAt desc){
    _id,
    email,
    name,
    submittedAt,
    source
  }`,

  counts: `{
    "gallery": count(*[_type == "galleryItem"]),
    "testimonials": count(*[_type == "testimonial"]),
    "faq": count(*[_type == "faq"]),
    "stravaOrdersNew": count(*[_type == "stravaMapOrder" && status == "new"]),
    "waitlist": count(*[_type == "waitlistEntry"])
  }`,
}
