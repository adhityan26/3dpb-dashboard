export const Q = {
  siteSettings: `*[_type == "siteSettings"][0]{
    brandName,
    tagline,
    contact{ whatsapp, instagram, email, address, operatingHours },
    marketplaceLinks,
    seo
  }`,

  generator: `*[_type == "silhouetteGenerator"][0]{
    headline,
    description,
    launchStatus,
    estimatedLaunch,
    orderUrl,
    orderLabel,
    "devScreenshots": devScreenshots[]{
      "imageUrl": asset->url,
      "imageRef": asset._ref,
      "alt": alt
    }
  }`,

  faceshell: `*[_type == "faceshellCollection"][0]{
    headline,
    description,
    orderWhatsappMessage,
    externalMeasurementUrl,
    externalMeasurementLabel,
    "items": items[]{
      _key,
      "imageUrl": image.asset->url,
      "imageRef": image.asset._ref,
      "alt": image.alt,
      title,
      caption
    }
  }`,

  gallery: `*[_type == "galleryItem"] | order(order asc){
    _id,
    title,
    "imageUrl": image.asset->url,
    "imageRef": image.asset._ref,
    "alt": image.alt,
    category,
    caption,
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
    question,
    answer,
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
