import { extractEmails } from "./emails"
import { decodeHtml } from "./html"
import { fetchExternal } from "./http"
import { classifyText, type Kind, type Offer, type OfferDetail } from "./offers"

const GUEST_SEARCH = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
const GUEST_JOB = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting"
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export type LinkedInHit = {
  id: string
  title: string
  organization: string
  city: string
  published: string | null
}

function tagText(block: string, className: string, close: string): string {
  const match = block.match(new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)</${close}>`))
  return decodeHtml(match?.[1] ?? "")
}

export function parseLinkedInHtml(html: string): LinkedInHit[] {
  const hits: LinkedInHit[] = []
  const pattern = /data-entity-urn="urn:li:jobPosting:(\d+)"([\s\S]*?)(?=data-entity-urn="urn:li:jobPosting:|$)/g
  for (const match of html.matchAll(pattern)) {
    const block = match[2]
    const title = tagText(block, "base-search-card__title", "h3")
    if (!title) continue
    hits.push({
      id: match[1],
      title,
      organization: tagText(block, "base-search-card__subtitle", "h4"),
      city: tagText(block, "job-search-card__location", "span"),
      published: block.match(/class="[^"]*job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"/)?.[1] ?? null,
    })
    if (hits.length >= 10) break
  }
  return hits
}

export function mapLinkedInHit(hit: LinkedInHit, hint: Kind): Offer | null {
  const kinds = classifyText(hit.title)
  if (!kinds.includes(hint)) return null
  return {
    id: `li:${hit.id}`,
    source: "linkedin",
    externalId: hit.id,
    title: hit.title,
    organization: hit.organization,
    city: hit.city,
    contract: kinds.includes("stage")
      ? "Stage"
      : kinds.includes("alternance")
        ? "Alternance"
        : kinds.includes("job")
          ? "Job étudiant"
          : "Premier emploi",
    description: "",
    url: `https://www.linkedin.com/jobs/view/${hit.id}`,
    kinds,
    spontaneous: false,
    zoneLabel: "",
    zoneRank: 0,
    distanceKm: null,
    published: hit.published,
  }
}

function linkedInQueries(query: string, kinds: Kind[]): { keywords: string; hint: Kind }[] {
  const base = query.trim()
  const queries: { keywords: string; hint: Kind }[] = []
  if (kinds.includes("stage")) queries.push({ keywords: [base, "stage"].filter(Boolean).join(" "), hint: "stage" })
  else if (kinds.includes("alternance")) {
    queries.push({ keywords: [base, "alternance"].filter(Boolean).join(" "), hint: "alternance" })
  }
  if (kinds.includes("junior")) queries.push({ keywords: [base, "junior"].filter(Boolean).join(" "), hint: "junior" })
  else if (kinds.includes("job")) {
    queries.push({ keywords: [base, "étudiant"].filter(Boolean).join(" "), hint: "job" })
  }
  return queries.slice(0, 2)
}

async function fetchLinkedInCards(keywords: string, location: string, hint: Kind): Promise<Offer[]> {
  const url = new URL(GUEST_SEARCH)
  url.searchParams.set("keywords", keywords)
  url.searchParams.set("location", location)
  url.searchParams.set("start", "0")
  let response = await fetchExternal(url.toString(), {
    headers: { Accept: "text/html", "User-Agent": BROWSER_UA },
  })
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    response = await fetchExternal(url.toString(), {
      headers: { Accept: "text/html", "User-Agent": BROWSER_UA },
    })
  }
  if (!response.ok) throw new Error(`LinkedIn a répondu ${response.status}.`)
  const html = await response.text()
  return parseLinkedInHtml(html).flatMap((hit) => {
    const offer = mapLinkedInHit(hit, hint)
    return offer ? [offer] : []
  })
}

export async function searchLinkedIn(input: {
  query: string
  city: string | null
  kinds: Kind[]
}): Promise<Offer[]> {
  const location = input.city ? `${input.city}, France` : "France"
  const queries = linkedInQueries(input.query, input.kinds)
  if (queries.length === 0) return []
  const settled = await Promise.allSettled(
    queries.map((item) => fetchLinkedInCards(item.keywords, location, item.hint)),
  )
  const offers = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  if (offers.length === 0) {
    const failure = settled.find((result) => result.status === "rejected")
    if (failure?.status === "rejected") throw failure.reason
  }
  return offers.slice(0, 12)
}

export function parseLinkedInDetail(html: string): string {
  const match = html.match(/class="show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/)
  return decodeHtml(match?.[1] ?? "").slice(0, 4000)
}

export async function fetchLinkedInDetail(offer: Offer): Promise<OfferDetail> {
  const response = await fetchExternal(`${GUEST_JOB}/${encodeURIComponent(offer.externalId)}`, {
    headers: { Accept: "text/html", "User-Agent": BROWSER_UA },
  })
  const description = response.ok ? parseLinkedInDetail(await response.text()) : offer.description
  const text = description || offer.description
  return {
    ...offer,
    description: text,
    emails: extractEmails(text),
    phone: null,
    website: null,
    hiddenEmail: false,
    applyUrl: offer.url,
  }
}
