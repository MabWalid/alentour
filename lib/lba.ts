import { fetchExternal } from "./http"
import { decodeHtml } from "./html"
import { extractEmails } from "./emails"
import { emailsOnSite } from "./site-email"
import { classifyText, slugify, type Offer, type OfferDetail } from "./offers"

const SEARCH_URL = "https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/search"
const DETAIL_URL = "https://labonnealternance.apprentissage.beta.gouv.fr/api/_private/jobs"

type LbaHit = {
  _id?: string
  url_id?: string
  sub_type?: string
  title?: string
  organization_name?: string
  address?: string
  description?: string
  contract_type?: string[]
  publication_date?: string
  is_algo_company?: boolean
  distance?: number
  type_filter_label?: string
}

type LbaDetail = {
  title?: string
  contact?: { email?: string; hasEmail?: boolean; phone?: string | null; url?: string | null }
  place?: { city?: string; fullAddress?: string }
  company?: { name?: string; url?: string | null }
  job?: { description?: string | null; employeurDescription?: string | null; creationDate?: string }
}

export function lbaPublicUrl(subType: string, urlId: string, title: string): string {
  return `https://labonnealternance.apprentissage.beta.gouv.fr/emploi/${subType}/${encodeURIComponent(urlId)}/${slugify(title)}`
}

export function mapLbaHit(
  hit: LbaHit,
  zone: { label: string; rank: number },
): Offer | null {
  const externalId = hit.url_id || hit._id
  const subType = hit.sub_type
  if (!externalId || !subType || !hit.title) return null
  const spontaneous = Boolean(hit.is_algo_company) || subType === "recruteurs_lba"
  const contract = (hit.contract_type ?? []).join(", ") || (spontaneous ? "Candidature spontanée" : "Alternance")
  const description = decodeHtml(hit.description || "")
  return {
    id: `lba:${externalId}`,
    source: "lba",
    externalId,
    subType,
    title: decodeHtml(hit.title),
    organization: decodeHtml(hit.organization_name || hit.title),
    city: decodeHtml(hit.address || ""),
    contract,
    description,
    url: lbaPublicUrl(subType, externalId, hit.title),
    kinds: ["alternance"],
    spontaneous,
    zoneLabel: zone.label,
    zoneRank: zone.rank,
    distanceKm: typeof hit.distance === "number" ? hit.distance : null,
    published: hit.publication_date || null,
  }
}

export async function searchLba(input: {
  query: string
  latitude?: number
  longitude?: number
  radiusKm?: number
}): Promise<Offer[]> {
  const url = new URL(SEARCH_URL)
  url.searchParams.set("mode", "emplois")
  url.searchParams.set("page", "0")
  url.searchParams.set("hitsPerPage", "15")
  if (input.query.trim()) url.searchParams.set("q", input.query.trim())
  if (input.latitude != null && input.longitude != null && input.radiusKm != null) {
    url.searchParams.set("latitude", String(input.latitude))
    url.searchParams.set("longitude", String(input.longitude))
    url.searchParams.set("radius", String(input.radiusKm))
  }
  const response = await fetchExternal(url.toString(), { headers: { Accept: "application/json" } })
  if (!response.ok) {
    throw new Error(`La bonne alternance a répondu ${response.status}.`)
  }
  const payload = (await response.json()) as { hits?: LbaHit[] }
  return (payload.hits ?? [])
    .map((hit) =>
      mapLbaHit(hit, {
        label: "",
        rank: 0,
      }),
    )
    .filter((offer): offer is Offer => offer != null)
}

export async function fetchLbaDetail(offer: Offer): Promise<OfferDetail> {
  const subType = offer.subType
  if (!subType) {
    return { ...offer, emails: extractEmails(offer.description), phone: null, website: null, hiddenEmail: false, applyUrl: offer.url }
  }
  const response = await fetchExternal(
    `${DETAIL_URL}/${encodeURIComponent(subType)}/${encodeURIComponent(offer.externalId)}`,
    { headers: { Accept: "application/json" } },
  )
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
  const detail = (await response.json()) as LbaDetail
  const description = [detail.job?.description, detail.job?.employeurDescription, offer.description]
    .filter(Boolean)
    .map((part) => decodeHtml(String(part)))
    .join("\n\n")
  const publishedEmail = (detail.contact?.email || "").trim().toLowerCase()
  const website = detail.company?.url || null
  const siteEmails = await emailsOnSite(website)
  const emails = [...new Set([...extractEmails(`${publishedEmail}\n${description}`), ...siteEmails])]
  return {
    ...offer,
    title: detail.title ? decodeHtml(detail.title) : offer.title,
    organization: detail.company?.name ? decodeHtml(detail.company.name) : offer.organization,
    city: detail.place?.city || detail.place?.fullAddress || offer.city,
    description,
    url: detail.contact?.url || offer.url,
    published: detail.job?.creationDate || offer.published,
    emails,
    phone: detail.contact?.phone || null,
    website,
    hiddenEmail: Boolean(detail.contact?.hasEmail) && !publishedEmail,
    applyUrl: detail.contact?.url || offer.url,
    kinds: classifyText(`${offer.title} ${description} alternance`).includes("alternance")
      ? ["alternance"]
      : offer.kinds,
  }
}

