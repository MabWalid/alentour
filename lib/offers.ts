export const KINDS = ["stage", "alternance", "job"] as const

export type Kind = (typeof KINDS)[number]

export type OfferSource = "lba" | "francetravail"

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
}

export const SOURCE_LABEL: Record<OfferSource, string> = {
  lba: "La bonne alternance",
  francetravail: "France Travail",
}

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value)
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
