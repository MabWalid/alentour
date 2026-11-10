export const KINDS = ["stage", "alternance", "job", "junior"] as const

export type Kind = (typeof KINDS)[number]

export type OfferSource = "lba" | "francetravail" | "linkedin" | "hellowork" | "freework"

export type Offer = {
  id: string
  source: OfferSource
  externalId: string
  subType?: string
  title: string
  organization: string
  city: string
  contract: string
  description: string
  url: string
  kinds: Kind[]
  spontaneous: boolean
  zoneLabel: string
  zoneRank: number
  distanceKm: number | null
  published: string | null
}

export type OfferDetail = Offer & {
  emails: string[]
  phone: string | null
  website: string | null
  hiddenEmail: boolean
  applyUrl: string | null
}

export type Place = {
  label: string
  city: string
  citycode: string | null
  latitude: number
  longitude: number
}

export const KIND_LABEL: Record<Kind, string> = {
  stage: "Stage",
  alternance: "Alternance",
  job: "Job étudiant",
  junior: "Premier emploi",
}

export const SOURCE_LABEL: Record<OfferSource, string> = {
  lba: "La bonne alternance",
  francetravail: "France Travail",
  linkedin: "LinkedIn",
  hellowork: "HelloWork",
  freework: "Free-Work",
}

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value)
}

const EXTERNAL_ID: Record<OfferSource, RegExp> = {
  hellowork: /^\d{1,12}$/,
  linkedin: /^\d{1,20}$/,
  francetravail: /^[A-Za-z0-9_-]{1,32}$/,
  lba: /^[A-Za-z0-9._-]{1,120}$/,
  freework: /^[A-Za-z0-9._-]{1,180}$/,
}

export function parseOfferRequest(value: unknown): Offer | null {
  if (!value || typeof value !== "object") return null
  const offer = value as Partial<Offer>
  if (
    offer.source !== "lba" &&
    offer.source !== "francetravail" &&
    offer.source !== "linkedin" &&
    offer.source !== "hellowork" &&
    offer.source !== "freework"
  ) {
    return null
  }
  if (typeof offer.externalId !== "string" || !EXTERNAL_ID[offer.source].test(offer.externalId)) return null
  if (offer.source === "lba") {
    if (typeof offer.subType !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(offer.subType)) return null
  }
  const text = (field: unknown, fallback: string, max: number) =>
    typeof field === "string" ? field.slice(0, max) : fallback
  const kinds = Array.isArray(offer.kinds)
    ? offer.kinds.filter((kind): kind is Kind => typeof kind === "string" && isKind(kind))
    : []
  return {
    id: text(offer.id, `${offer.source}:${offer.externalId}`, 180),
    source: offer.source,
    externalId: offer.externalId,
    subType: typeof offer.subType === "string" ? offer.subType.slice(0, 80) : undefined,
    title: text(offer.title, "Offre", 180),
    organization: text(offer.organization, "", 180),
    city: text(offer.city, "", 120),
    contract: text(offer.contract, "", 120),
    description: text(offer.description, "", 4000),
    url: "",
    kinds,
    spontaneous: Boolean(offer.spontaneous),
    zoneLabel: text(offer.zoneLabel, "", 120),
    zoneRank: typeof offer.zoneRank === "number" ? offer.zoneRank : 4,
    distanceKm: typeof offer.distanceKm === "number" ? offer.distanceKm : null,
    published: typeof offer.published === "string" ? offer.published.slice(0, 80) : null,
  }
}

export function zoneLabel(city: string, km: number | null): string {
  if (km == null) return "Ailleurs en France"
  if (km <= 20) return `${city} et tout près`
  return `Dans les ${km} km autour de ${city}`
}

export function classifyText(text: string): Kind[] {
  const value = text.toLowerCase()
  const kinds: Kind[] = []
  if (/\bstages?\b|stagiaire/.test(value)) kinds.push("stage")
  if (/alternance|apprentissage|professionnalisation/.test(value)) {
    kinds.push("alternance")
  }
  if (/junior|débutant|debutant|premier emploi|nouveau dipl|jeune dipl|jeune diplom/.test(value)) {
    kinds.push("junior")
  }
  const studentJob =
    /étudiant|etudiant|job étudiant|temps partiel|mi-temps|mi temps|saisonnier|vacation/.test(
      value,
    ) || /\bextra\b/.test(value)
  if (studentJob) kinds.push("job")
  return kinds
}

export function matchesKinds(offerKinds: Kind[], selected: Kind[]): boolean {
  return offerKinds.some((kind) => selected.includes(kind))
}

export function isTrainingListing(offer: Pick<Offer, "title" | "organization" | "description" | "contract">): boolean {
  const title = offer.title.toLowerCase()
  const blob = `${offer.title}\n${offer.organization}\n${offer.contract}\n${offer.description}`.toLowerCase()
  if (/\b(cfa|c\.f\.a|centre de formation|organisme de formation|titre rncp|\brncp\b)\b/.test(blob)) {
    return true
  }
  if (/^formation\b/.test(title.trim())) return true
  if (/\bformation\b/.test(title) && /(alternance|apprentissage|contrat pro)/.test(title)) return true
  return false
}

export function isClosedApplyUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return true
  }
  const href = parsed.href.toLowerCase()
  const host = parsed.hostname.toLowerCase()
  if (!/^https?:$/.test(parsed.protocol)) return true
  if (/(^|\.)linkedin\.com$/.test(host) && /\/signup|\/authwall|\/uas\/|\/login|checkpoint|cold-join|session_redirect=/.test(href)) {
    return true
  }
  return false
}

export function dedupeKey(offer: Pick<Offer, "title" | "organization">): string {
  const title = offer.title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 48)
  const organization = offer.organization
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36)
  return `${title}|${organization}`
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "offre"
}
