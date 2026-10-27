import { pickCvLines, type Profile } from "./draft"
import { offerLocality } from "./near"
import type { Offer } from "./offers"
import type { Application, ApplicationStatus } from "./storage"

export function parisDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number)
  const utc = new Date(Date.UTC(year, (month || 1) - 1, date || 1))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

export function relanceDue(
  application: { status: ApplicationStatus; sentAt: string | null },
  today: string,
): boolean {
  if (application.status === "relance") return true
  if (application.status !== "envoye" || !application.sentAt) return false
  return addDays(application.sentAt, 7) <= today
}

export function rememberSeen(
  seen: Record<string, string>,
  offers: Offer[],
  today: string,
): { seen: Record<string, string>; fresh: number } {
  const next = { ...seen }
  let fresh = 0
  for (const offer of offers) {
    if (!next[offer.id]) {
      next[offer.id] = today
      fresh += 1
    }
  }
  const entries = Object.entries(next)
  if (entries.length <= 400) return { seen: next, fresh }
  entries.sort((a, b) => a[1].localeCompare(b[1]))
  return { seen: Object.fromEntries(entries.slice(entries.length - 400)), fresh }
}

export function groupByCity(offers: Offer[]): { city: string; offers: Offer[] }[] {
  const groups = new Map<string, Offer[]>()
  for (const offer of offers) {
    const city = offerLocality(offer.city) || "Ville non précisée"
    const list = groups.get(city) ?? []
    list.push(offer)
    groups.set(city, list)
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "fr"))
    .map(([city, list]) => ({ city, offers: list }))
}

const SEEKING_STOP = new Set(["pour", "avec", "dans", "stage", "offre", "job", "emploi"])

export function scoreOffer(profile: Profile, offer: Offer): number {
  let score = 0
  if (offer.kinds.some((kind) => profile.kinds.includes(kind))) score += 3
  const city = profile.city.trim().toLowerCase()
  if (city && offer.city.toLowerCase().includes(city)) score += 3
  if (offer.zoneRank === 0) score += 2
  const seeking = profile.seeking
    .toLowerCase()
    .split(/[^a-zàâäéèêëïîôùûüç0-9]+/)
    .filter((word) => word.length > 2 && !SEEKING_STOP.has(word))
  const haystack = `${offer.title} ${offer.description}`.toLowerCase()
  for (const word of seeking) {
    if (haystack.includes(word)) score += 2
  }
  score += pickCvLines(profile.cv, offer).length
  if (offer.spontaneous) score -= 1
  return score
}

export function rankForPreparation(
  profile: Profile,
  offers: Offer[],
  applications: Record<string, { status: ApplicationStatus } | undefined>,
): Offer[] {
  return offers
    .filter((offer) => {
      const status = applications[offer.id]?.status
      return status !== "envoye" && status !== "relance" && status !== "passe"
    })
    .map((offer) => ({ offer, score: scoreOffer(profile, offer) }))
    .sort((a, b) => b.score - a.score || a.offer.zoneRank - b.offer.zoneRank)
    .slice(0, 5)
    .map((item) => item.offer)
}

export function suiviBilan(applications: Application[], today: string) {
  const list = applications
  return {
    relance: list.filter((item) => relanceDue(item, today)).length,
    preparee: list.filter((item) => item.status === "preparee").length,
    envoyee: list.filter((item) => item.status === "envoye" && !relanceDue(item, today)).length,
    brouillon: list.filter((item) => item.status === "brouillon" || item.status === "vu").length,
  }
}
