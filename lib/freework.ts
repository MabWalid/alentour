import { extractEmails } from "./emails"
import { decodeHtml } from "./html"
import { fetchExternal } from "./http"
import { classifyText, type Kind, type Offer, type OfferDetail } from "./offers"

const API = "https://www.free-work.com/api"
const HEADERS = { Accept: "application/ld+json", "X-Varnish-Public": "1" }

type FreeWorkLocation = {
  countryCode?: string
  key?: string
  shortLabel?: string
  label?: string
}

type FreeWorkPosting = {
  id?: number
  title?: string
  slug?: string
  description?: string
  experienceLevel?: string
  contracts?: string[]
  publishedAt?: string
  applicationContact?: string | { email?: string; phone?: string } | null
  applicationUrl?: string | null
  location?: { shortLabel?: string; label?: string }
  company?: { name?: string }
  job?: { slug?: string }
}

const locationKeys = new Map<string, string | null>()

export function freeWorkKinds(posting: Pick<FreeWorkPosting, "title" | "description" | "contracts" | "experienceLevel">): Kind[] {
  const contracts = posting.contracts ?? []
  const kinds = classifyText(`${posting.title ?? ""}\n${contracts.join(" ")}\n${decodeHtml(posting.description ?? "").slice(0, 500)}`)
  if (contracts.includes("internship") && !kinds.includes("stage")) kinds.push("stage")
  if (contracts.includes("apprenticeship") && !kinds.includes("alternance")) kinds.push("alternance")
  if (posting.experienceLevel === "junior" && !kinds.includes("junior")) kinds.push("junior")
  return kinds
}

export function mapFreeWorkPosting(posting: FreeWorkPosting): Offer | null {
  if (!posting.id || !posting.title || !posting.slug) return null
  const jobSlug = posting.job?.slug
  const kinds = freeWorkKinds(posting)
  if (kinds.length === 0) return null
  const contact = contactText(posting.applicationContact)
  return {
    id: `fw:${posting.id}`,
    source: "freework",
    externalId: posting.slug,
    subType: jobSlug,
    title: decodeHtml(posting.title),
    organization: decodeHtml(posting.company?.name || ""),
    city: decodeHtml(posting.location?.shortLabel || posting.location?.label || ""),
    contract: contractLabel(posting),
    description: [decodeHtml(posting.description || ""), contact].filter(Boolean).join("\n").slice(0, 4000),
    url: jobSlug
      ? `https://www.free-work.com/fr/tech-it/job-mission/${jobSlug}/${posting.slug}`
      : "https://www.free-work.com/fr/tech-it/jobs",
    kinds,
    spontaneous: false,
    zoneLabel: "",
    zoneRank: 0,
    distanceKm: null,
    published: posting.publishedAt || null,
  }
}

function contactText(contact: FreeWorkPosting["applicationContact"]): string {
  if (!contact) return ""
  if (typeof contact === "string") return contact
  return [contact.email, contact.phone].filter(Boolean).join(" ")
}

function contractLabel(posting: FreeWorkPosting): string {
  const names: Record<string, string> = {
    internship: "Stage",
    apprenticeship: "Alternance",
    permanent: "CDI",
    "fixed-term": "CDD",
    contractor: "Freelance",
  }
  const label = (posting.contracts ?? []).map((item) => names[item] || item).join(" · ")
  if (posting.experienceLevel === "junior") return label ? `${label} · junior` : "Junior"
  return label
}

async function locationKey(city: string): Promise<string | null> {
  const cacheKey = city.trim().toLowerCase()
  if (locationKeys.has(cacheKey)) return locationKeys.get(cacheKey) ?? null
  const url = new URL(`${API}/locations/search`)
  url.searchParams.set("search", city.trim())
  const response = await fetchExternal(url.toString(), { headers: HEADERS })
  if (!response.ok) {
    locationKeys.set(cacheKey, null)
    return null
  }
  const places = (await response.json()) as FreeWorkLocation[]
  const match = places.find((place) => place.countryCode === "FR" && place.key)
  const key = match?.key ?? null
  locationKeys.set(cacheKey, key)
  return key
}

async function fetchPostings(params: Record<string, string>): Promise<Offer[]> {
  const url = new URL(`${API}/job_postings`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await fetchExternal(url.toString(), { headers: HEADERS })
  if (!response.ok) throw new Error(`Free-Work a répondu ${response.status}.`)
  const payload = (await response.json()) as { "hydra:member"?: FreeWorkPosting[] }
  return (payload["hydra:member"] ?? []).flatMap((posting) => {
    const offer = mapFreeWorkPosting(posting)
    return offer ? [offer] : []
  })
}

export async function searchFreeWork(input: {
  query: string
  city: string | null
  kinds: Kind[]
}): Promise<Offer[]> {
  const params: Record<string, string> = { itemsPerPage: "12" }
  const keywords = input.query.trim()
  if (keywords) params.searchKeywords = keywords
  if (input.city) {
    const key = await locationKey(input.city)
    if (!key) return []
    params.locationKeys = key
    params.locationRadius = "30"
  }
  const calls: Record<string, string>[] = []
  if (input.kinds.includes("stage")) calls.push({ ...params, contracts: "internship" })
  if (input.kinds.includes("junior") || input.kinds.includes("job")) {
    calls.push({ ...params, experienceLevels: "junior" })
  }
  if (calls.length === 0 && input.kinds.includes("alternance")) calls.push(params)
  const settled = await Promise.allSettled(calls.map((call) => fetchPostings(call)))
  const offers = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  if (offers.length === 0) {
    const failure = settled.find((result) => result.status === "rejected")
    if (failure?.status === "rejected") throw failure.reason
  }
  return offers.slice(0, 12)
}

export async function fetchFreeWorkDetail(offer: Offer): Promise<OfferDetail> {
  const response = await fetchExternal(`${API}/job_postings/${encodeURIComponent(offer.externalId)}`, {
    headers: HEADERS,
  })
  if (!response.ok) {
    return {
      ...offer,
      emails: extractEmails(offer.description),
      phone: null,
      website: null,
      hiddenEmail: false,
      applyUrl: offer.url,
    }
  }
  const posting = (await response.json()) as FreeWorkPosting
  const mapped = mapFreeWorkPosting(posting)
  const description = mapped?.description || offer.description
  const contact = posting.applicationContact
  const phone = contact && typeof contact === "object" ? contact.phone || null : null
  return {
    ...offer,
    title: mapped?.title || offer.title,
    organization: mapped?.organization || offer.organization,
    city: mapped?.city || offer.city,
    description,
    url: mapped?.url || offer.url,
    emails: extractEmails(description),
    phone,
    website: null,
    hiddenEmail: false,
    applyUrl: posting.applicationUrl || offer.url,
  }
}
