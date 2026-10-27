import { buildDraft, defaultProfile, type Draft, type Profile } from "./draft"
import { isKind, type Kind, type Offer } from "./offers"

export type ApplicationStatus = "vu" | "preparee" | "brouillon" | "envoye" | "relance" | "passe"

export type Application = {
  offer: Offer
  status: ApplicationStatus
  subject: string
  body: string
  updatedAt: string
  sentAt: string | null
  applyUrl: string
  highlight: string
}

export type Digest = {
  day: string
  fetchedAt: string
  scopeLabel: string
  warnings: string[]
  place: { city: string; label: string } | null
  offers: Offer[]
}

export type Store = {
  profile: Profile
  applications: Record<string, Application>
  seen: Record<string, string>
  digest: Digest | null
}

export const STORE_KEY = "alentour.v1"

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  vu: "À regarder",
  preparee: "Préparée",
  brouillon: "Brouillon",
  envoye: "Envoyée",
  relance: "À relancer",
  passe: "Laissée de côté",
}

export function emptyStore(): Store {
  return {
    profile: { ...defaultProfile, kinds: [...defaultProfile.kinds] },
    applications: {},
    seen: {},
    digest: null,
  }
}

function asProfile(value: unknown): Profile {
  const source = value && typeof value === "object" ? (value as Partial<Profile>) : {}
  const kinds = Array.isArray(source.kinds)
    ? source.kinds.filter((kind): kind is Kind => typeof kind === "string" && isKind(kind))
    : defaultProfile.kinds
  const text = (field: unknown, fallback: string) =>
    typeof field === "string" ? field.slice(0, 800) : fallback
  return {
    firstName: text(source.firstName, ""),
    lastName: text(source.lastName, ""),
    email: text(source.email, ""),
    phone: text(source.phone, ""),
    city: text(source.city, defaultProfile.city) || defaultProfile.city,
    school: text(source.school, ""),
    level: text(source.level, ""),
    seeking: text(source.seeking, ""),
    pitch: text(source.pitch, ""),
    availability: text(source.availability, ""),
    cv: typeof source.cv === "string" ? source.cv.slice(0, 12000) : "",
    kinds: kinds.length > 0 ? kinds : [...defaultProfile.kinds],
  }
}

function asOffer(value: unknown): Offer | null {
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
  if (typeof offer.id !== "string" || typeof offer.title !== "string") return null
  const kinds = Array.isArray(offer.kinds)
    ? offer.kinds.filter((kind): kind is Kind => typeof kind === "string" && isKind(kind))
    : []
  return {
    id: offer.id.slice(0, 180),
    source: offer.source,
    externalId: typeof offer.externalId === "string" ? offer.externalId.slice(0, 120) : offer.id,
    subType: typeof offer.subType === "string" ? offer.subType.slice(0, 80) : undefined,
    title: offer.title.slice(0, 180),
    organization: typeof offer.organization === "string" ? offer.organization.slice(0, 180) : "",
    city: typeof offer.city === "string" ? offer.city.slice(0, 120) : "",
    contract: typeof offer.contract === "string" ? offer.contract.slice(0, 120) : "",
    description: typeof offer.description === "string" ? offer.description.slice(0, 4000) : "",
    url: typeof offer.url === "string" ? offer.url.slice(0, 500) : "",
    kinds,
    spontaneous: Boolean(offer.spontaneous),
    zoneLabel: typeof offer.zoneLabel === "string" ? offer.zoneLabel.slice(0, 120) : "",
    zoneRank: typeof offer.zoneRank === "number" ? offer.zoneRank : 4,
    distanceKm: typeof offer.distanceKm === "number" ? offer.distanceKm : null,
    published: typeof offer.published === "string" ? offer.published.slice(0, 80) : null,
  }
}

export function parseBackup(input: unknown): Store | null {
  if (!input || typeof input !== "object") return null
  const source = input as { profile?: unknown; applications?: unknown; seen?: unknown; digest?: unknown }
  const applications: Record<string, Application> = {}
  if (source.applications && typeof source.applications === "object") {
    for (const [key, value] of Object.entries(source.applications)) {
      if (!value || typeof value !== "object") continue
      const item = value as Partial<Application>
      const offer = asOffer(item.offer)
      if (!offer) continue
      const status: ApplicationStatus =
        item.status === "preparee" ||
        item.status === "brouillon" ||
        item.status === "envoye" ||
        item.status === "relance" ||
        item.status === "passe" ||
        item.status === "vu"
          ? item.status
          : "vu"
      applications[key.slice(0, 180)] = {
        offer,
        status,
        subject: typeof item.subject === "string" ? item.subject.slice(0, 180) : "",
        body: typeof item.body === "string" ? item.body.slice(0, 6000) : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt.slice(0, 40) : "",
        sentAt: typeof item.sentAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.sentAt) ? item.sentAt : null,
        applyUrl: typeof item.applyUrl === "string" ? item.applyUrl.slice(0, 500) : offer.url,
        highlight: typeof item.highlight === "string" ? item.highlight.slice(0, 800) : "",
      }
      if (Object.keys(applications).length >= 500) break
    }
  }
  const seen: Record<string, string> = {}
  if (source.seen && typeof source.seen === "object") {
    for (const [key, value] of Object.entries(source.seen)) {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) seen[key.slice(0, 180)] = value
      if (Object.keys(seen).length >= 400) break
    }
  }
  return { profile: asProfile(source.profile), applications, seen, digest: asDigest(source.digest) }
}

function asDigest(value: unknown): Digest | null {
  if (!value || typeof value !== "object") return null
  const source = value as Partial<Digest>
  if (typeof source.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(source.day)) return null
  const offers = Array.isArray(source.offers)
    ? source.offers.map(asOffer).filter((offer): offer is Offer => Boolean(offer)).slice(0, 40)
    : []
  const place =
    source.place && typeof source.place === "object" && typeof source.place.city === "string"
      ? { city: source.place.city.slice(0, 80), label: typeof source.place.label === "string" ? source.place.label.slice(0, 120) : source.place.city }
      : null
  return {
    day: source.day,
    fetchedAt: typeof source.fetchedAt === "string" ? source.fetchedAt.slice(0, 80) : "",
    scopeLabel: typeof source.scopeLabel === "string" ? source.scopeLabel.slice(0, 80) : "",
    warnings: Array.isArray(source.warnings)
      ? source.warnings.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [],
    place,
    offers,
  }
}

export function loadStore(): Store {
  if (typeof window === "undefined") return emptyStore()
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return emptyStore()
    return parseBackup(JSON.parse(raw)) ?? emptyStore()
  } catch {
    return emptyStore()
  }
}

export function saveStore(store: Store) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

const serverStore = emptyStore()
let memory: Store | null = null
const listeners = new Set<() => void>()

export function subscribeStore(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getClientStore(): Store {
  if (!memory) memory = loadStore()
  return memory
}

export function getServerStore(): Store {
  return serverStore
}

export function setClientStore(store: Store) {
  memory = store
  saveStore(store)
  listeners.forEach((listener) => listener())
}

export function draftFor(profile: Profile, offer: Offer, existing?: Application): Draft {
  if (existing && (existing.subject || existing.body)) {
    return { subject: existing.subject, body: existing.body }
  }
  return buildDraft(profile, offer)
}
