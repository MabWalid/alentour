import { extractEmails } from "./emails"
import { decodeHtml } from "./html"
import { fetchExternal } from "./http"
import { classifyText, type Offer, type OfferDetail } from "./offers"

const SEARCH_URL = "https://candidat.francetravail.fr/offres/recherche"
const DETAIL_URL = "https://candidat.francetravail.fr/api-descriptifoffre/offre"

export type FranceTravailHit = {
  id: string
  title: string
  organization: string
  city: string
  contract: string
  description: string
  published: string | null
}

export function parseFranceTravailHtml(html: string): FranceTravailHit[] {
  const hits: FranceTravailHit[] = []
  const pattern = /<li data-id-offre="([^"]+)" class="result">([\s\S]*?)<\/li>/g
  for (const match of html.matchAll(pattern)) {
    const id = match[1]
    const block = match[2]
    const title = decodeHtml(block.match(/class="media-heading-title">([\s\S]*?)<\/span>/)?.[1] ?? "")
    const subtext = decodeHtml(block.match(/class="subtext">([\s\S]*?)<\/p>/)?.[1] ?? "")
    const description = decodeHtml(block.match(/class="description">([\s\S]*?)<\/p>/)?.[1] ?? "")
    const contract = decodeHtml(
      block.match(/class="contrat visible-xs">([\s\S]*?)<\/p>/)?.[1] ??
        block.match(/class="contrat">([\s\S]*?)<\/p>/)?.[1] ??
        "",
    )
    const published = decodeHtml(block.match(/class="date">([\s\S]*?)<\/p>/)?.[1] ?? "") || null
    const [organization, ...rest] = subtext.split(/\s+-\s+/)
    if (!title) continue
    hits.push({
      id,
      title,
      organization: (organization || "").trim(),
      city: rest.join(" - ").trim() || subtext,
      contract: contract.replace(/\s+-\s+/g, " · "),
      description,
      published,
    })
  }
  return hits
}

export function mapFranceTravailHit(
  hit: FranceTravailHit,
  zone: { label: string; rank: number },
): Offer {
  const kinds = classifyText(`${hit.title}\n${hit.contract}\n${hit.description}`)
  return {
    id: `ft:${hit.id}`,
    source: "francetravail",
    externalId: hit.id,
    title: hit.title,
    organization: hit.organization,
    city: hit.city,
    contract: hit.contract,
    description: hit.description,
    url: `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(hit.id)}`,
    kinds,
    spontaneous: false,
    zoneLabel: zone.label,
    zoneRank: zone.rank,
    distanceKm: null,
    published: hit.published,
  }
}

export async function searchFranceTravail(input: {
  query: string
  citycode?: string | null
  radiusKm?: number
}): Promise<Offer[]> {
  const url = new URL(SEARCH_URL)
  url.searchParams.set("motsCles", input.query.trim() || "stage")
  url.searchParams.set("offresPartenaires", "true")
  url.searchParams.set("tri", "0")
  url.searchParams.set("range", "0-19")
  if (input.citycode && input.radiusKm != null) {
    url.searchParams.set("lieux", input.citycode)
    url.searchParams.set("rayon", String(input.radiusKm))
  }
  const response = await fetchExternal(url.toString(), { headers: { Accept: "text/html" } })
  if (!response.ok) throw new Error(`France Travail a répondu ${response.status}.`)
  const html = await response.text()
  return parseFranceTravailHtml(html).map((hit) => mapFranceTravailHit(hit, { label: "", rank: 0 }))
}

type FtDetail = {
  intituleOffre?: string
  descriptif?: string
  descriptionEntreprise?: string | null
  syntheseContrat?: string
  libelleLieuTravail?: string
  salaire?: string
  pageEmployeurUrl?: string | null
  etablissement?: { libelleEnseigne?: string; urlEntreprise?: string | null }
}

export async function fetchFranceTravailDetail(offer: Offer): Promise<OfferDetail> {
  const response = await fetchExternal(`${DETAIL_URL}/${encodeURIComponent(offer.externalId)}`, {
    headers: { Accept: "application/json" },
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
  const detail = (await response.json()) as FtDetail
  const description = [detail.descriptif, detail.descriptionEntreprise, detail.salaire, offer.description]
    .filter(Boolean)
    .map((part) => decodeHtml(String(part)))
    .join("\n\n")
  const website = detail.etablissement?.urlEntreprise || detail.pageEmployeurUrl || null
  const kinds = [
    ...new Set([
      ...offer.kinds,
      ...classifyText(
        `${detail.intituleOffre || offer.title}\n${detail.syntheseContrat || offer.contract}\n${description}`,
      ),
    ]),
  ]
  return {
    ...offer,
    title: detail.intituleOffre ? decodeHtml(detail.intituleOffre) : offer.title,
    organization: detail.etablissement?.libelleEnseigne || offer.organization,
    city: detail.libelleLieuTravail || offer.city,
    contract: detail.syntheseContrat || offer.contract,
    description,
    kinds,
    emails: extractEmails(description),
    phone: null,
    website,
    hiddenEmail: false,
    applyUrl: `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(offer.externalId)}`,
  }
}
