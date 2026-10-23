import { extractEmails } from "./emails"
import { decodeHtml } from "./html"
import { fetchExternal } from "./http"
import { classifyText, type Kind, type Offer, type OfferDetail } from "./offers"

const SEARCH_URL = "https://www.hellowork.com/fr-fr/emploi/recherche.html"

export type HelloWorkHit = {
  id: string
  title: string
  organization: string
  city: string
  contract: string
}

export function parseHelloWorkLabel(label: string): Omit<HelloWorkHit, "id"> | null {
  const text = decodeHtml(label).replace(/\s+/g, " ").trim()
  const match = text.match(/^Voir offre de (.+) à ([^,]+), chez (.+), pour un (.+)$/)
  if (!match) return null
  return {
    title: match[1].trim(),
    city: match[2].trim(),
    organization: match[3].replace(/, super recruteur$/, "").trim(),
    contract: match[4].trim(),
  }
}

export function parseHelloWorkHtml(html: string): HelloWorkHit[] {
  const hits: HelloWorkHit[] = []
  const pattern = /href="\/fr-fr\/emplois\/(\d+)\.html"[\s\S]*?aria-label="([^"]+)"([\s\S]*?)<\/a>/g
  for (const match of html.matchAll(pattern)) {
    const parsed = parseHelloWorkLabel(match[2])
    if (!parsed) continue
    const visible = decodeHtml(match[3].match(/<span class="[^"]*\bblock\b[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? "")
    hits.push({ id: match[1], ...parsed, title: visible || parsed.title })
    if (hits.length >= 12) break
  }
  return hits
}

export function mapHelloWorkHit(hit: HelloWorkHit, hint: Kind): Offer | null {
  const kinds = classifyText(`${hit.title}\n${hit.contract}`)
  if (!kinds.includes(hint)) return null
  return {
    id: `hw:${hit.id}`,
    source: "hellowork",
    externalId: hit.id,
    title: hit.title,
    organization: hit.organization,
    city: hit.city,
    contract: hit.contract,
    description: "",
    url: `https://www.hellowork.com/fr-fr/emplois/${hit.id}.html`,
    kinds,
    spontaneous: false,
    zoneLabel: "",
    zoneRank: 0,
    distanceKm: null,
    published: null,
  }
}

function helloWorkQueries(query: string, kinds: Kind[]): { keywords: string; contract: string | null; hint: Kind }[] {
  const base = query.trim()
  const queries: { keywords: string; contract: string | null; hint: Kind }[] = []
  if (kinds.includes("stage")) queries.push({ keywords: base, contract: "Stage", hint: "stage" })
  if (kinds.includes("alternance")) queries.push({ keywords: base, contract: "Alternance", hint: "alternance" })
  if (kinds.includes("junior")) queries.push({ keywords: [base, "junior"].filter(Boolean).join(" "), contract: null, hint: "junior" })
  else if (kinds.includes("job")) {
    queries.push({ keywords: [base, "étudiant"].filter(Boolean).join(" "), contract: null, hint: "job" })
  }
  return queries
}

async function fetchHelloWorkCards(
  keywords: string,
  city: string | null,
  contract: string | null,
  hint: Kind,
): Promise<Offer[]> {
  const url = new URL(SEARCH_URL)
  if (keywords) url.searchParams.set("k", keywords)
  if (city) url.searchParams.set("l", city)
  if (contract) url.searchParams.set("c", contract)
  const response = await fetchExternal(url.toString(), { headers: { Accept: "text/html" } })
  if (!response.ok) throw new Error(`HelloWork a répondu ${response.status}.`)
  const html = await response.text()
  return parseHelloWorkHtml(html).flatMap((hit) => {
    const offer = mapHelloWorkHit(hit, hint)
    return offer ? [offer] : []
  })
}

export async function searchHelloWork(input: {
  query: string
  city: string | null
  kinds: Kind[]
}): Promise<Offer[]> {
  const queries = helloWorkQueries(input.query, input.kinds)
  if (queries.length === 0) return []
  const settled = await Promise.allSettled(
    queries.map((item) => fetchHelloWorkCards(item.keywords, input.city, item.contract, item.hint)),
  )
  const offers = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  if (offers.length === 0) {
    const failure = settled.find((result) => result.status === "rejected")
    if (failure?.status === "rejected") throw failure.reason
  }
  return offers.slice(0, 16)
}

export function parseHelloWorkDetail(html: string): string {
  const start = html.search(/<h2>\s*Les missions du poste/i)
  if (start < 0) return ""
  const slice = html.slice(start, start + 14000)
  const end = slice.search(/<h2>\s*Mais aussi/i)
  return decodeHtml(end > 0 ? slice.slice(0, end) : slice).slice(0, 4000)
}

export function helloWorkApplyUrl(html: string, fallback: string): string {
  const external = html.match(/data-cy="applyButton[^"]*"[\s\S]{0,400}?href="(https:[^"]+)"|href="(https:[^"]+)"[\s\S]{0,200}?data-cy="applyButton/i)
  const href = external?.[1] || external?.[2]
  if (href && !/hellowork\.com/i.test(href)) return decodeHtml(href)
  return fallback.includes("#postuler") ? fallback : `${fallback}#postuler`
}

export async function fetchHelloWorkDetail(offer: Offer): Promise<OfferDetail> {
  const response = await fetchExternal(offer.url, { headers: { Accept: "text/html" } })
  const html = response.ok ? await response.text() : ""
  const description = html ? parseHelloWorkDetail(html) : ""
  const text = description || offer.description
  return {
    ...offer,
    description: text,
    emails: extractEmails(`${html}\n${text}`),
    phone: null,
    website: null,
    hiddenEmail: false,
    applyUrl: html ? helloWorkApplyUrl(html, offer.url) : `${offer.url}#postuler`,
  }
}
