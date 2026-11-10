import { defaultProfile } from "./draft"
import { searchFranceTravail } from "./francetravail"
import { searchFreeWork } from "./freework"
import { geocodeCity } from "./geocode"
import { searchHelloWork } from "./hellowork"
import { SEARCH_BUDGET_MS } from "./http"
import { searchLba } from "./lba"
import { searchLinkedIn } from "./linkedin"
import { keepInRing } from "./near"
import {
  dedupeKey,
  isTrainingListing,
  matchesKinds,
  zoneLabel,
  type Kind,
  type Offer,
  type Place,
} from "./offers"
import { scoreOffer } from "./prepare"

export const RINGS_KM = [15, 40, 80, 150] as const
const TARGET = 16
const FRANCE_RANK = RINGS_KM.length

export type SearchResult = {
  offers: Offer[]
  place: Place | null
  warnings: string[]
  fetchedAt: string
  scopeLabel: string
}

function stamp(offers: Offer[], city: string, km: number | null, rank: number): Offer[] {
  const label = zoneLabel(city, km)
  return offers.map((offer) => ({ ...offer, zoneLabel: label, zoneRank: rank }))
}

function franceTravailQueries(query: string, kinds: Kind[]): string[] {
  const base = query.trim()
  const queries: string[] = []
  if (kinds.includes("stage")) queries.push([base, "stage"].filter(Boolean).join(" "))
  if (kinds.includes("alternance")) queries.push([base, "alternance"].filter(Boolean).join(" "))
  if (kinds.includes("job")) queries.push([base, "étudiant"].filter(Boolean).join(" "))
  if (kinds.includes("junior")) queries.push([base, "junior"].filter(Boolean).join(" "))
  return [...new Set(queries)]
}

function remember(bucket: Offer[], seenIds: Set<string>, seenText: Set<string>, incoming: Offer[], kinds: Kind[]) {
  for (const offer of incoming) {
    if (!matchesKinds(offer.kinds, kinds)) continue
    if (isTrainingListing(offer)) continue
    if (seenIds.has(offer.id)) continue
    const textKey = dedupeKey(offer)
    if (seenText.has(textKey)) continue
    seenIds.add(offer.id)
    seenText.add(textKey)
    bucket.push(offer)
    if (bucket.length >= 40) return
  }
}

function leftover(started: number): number {
  return SEARCH_BUDGET_MS - (Date.now() - started)
}

async function withinBudget<T>(started: number, task: Promise<T>, fallback: T): Promise<T> {
  const ms = leftover(started)
  if (ms < 250) return fallback
  return Promise.race([
    task,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms)
    }),
  ])
}

export async function searchOffers(input: {
  query: string
  city: string
  kinds: Kind[]
}): Promise<SearchResult> {
  const started = Date.now()
  const query = input.query.trim() || defaultProfile.seeking
  const warnings: string[] = []
  const offers: Offer[] = []
  const seenIds = new Set<string>()
  const seenText = new Set<string>()
  const place = await withinBudget(started, geocodeCity(input.city).catch(() => null), null)
  if (!place) {
    warnings.push(`Je n'ai pas trouvé « ${input.city} » sur la carte. Je cherche dans toute la France.`)
  }

  const pull = async (km: number | null, rank: number) => {
    const budget = leftover(started)
    if (budget < 400) {
      if (!warnings.includes("Certaines sources n'ont pas eu le temps de répondre.")) {
        warnings.push("Certaines sources n'ont pas eu le temps de répondre.")
      }
      return
    }
    const tasks: Promise<Offer[]>[] = []
    if (input.kinds.includes("alternance")) {
      tasks.push(
        searchLba({
          query,
          latitude: km != null && place ? place.latitude : undefined,
          longitude: km != null && place ? place.longitude : undefined,
          radiusKm: km != null && place ? km : undefined,
        }),
      )
    }
    for (const ftQuery of franceTravailQueries(query, input.kinds)) {
      tasks.push(
        searchFranceTravail({
          query: ftQuery,
          citycode: km != null && place ? place.citycode : null,
          radiusKm: km != null && place ? km : undefined,
        }),
      )
    }
    if (km === 15 || km == null) {
      const city = km != null && place ? place.city : null
      tasks.push(searchLinkedIn({ query, city, kinds: input.kinds }))
      tasks.push(searchHelloWork({ query, city, kinds: input.kinds }))
      tasks.push(searchFreeWork({ query, city, kinds: input.kinds }))
    }
    const settled = await Promise.allSettled(
      tasks.map((task) =>
        withinBudget(started, task, [] as Offer[]).then((value) => {
          if (Array.isArray(value) && value.length === 0 && leftover(started) < 50) {
            return value
          }
          return value
        }),
      ),
    )
    for (const result of settled) {
      if (result.status !== "fulfilled") {
        if (!warnings.includes("Une source n'a pas répondu.")) warnings.push("Une source n'a pas répondu.")
        continue
      }
      if (leftover(started) < 200 || !place || km == null) {
        remember(offers, seenIds, seenText, stamp(result.value, place?.city || input.city, km, rank), input.kinds)
        continue
      }
      const local = await withinBudget(started, keepInRing(result.value, place, km), result.value)
      remember(offers, seenIds, seenText, stamp(local, place.city, km, rank), input.kinds)
    }
  }

  if (place) {
    await pull(15, 0)
    if (offers.length < TARGET && leftover(started) > 1_200) {
      await pull(40, 1)
    }
  }
  if (offers.length < 8 && leftover(started) > 800) await pull(null, FRANCE_RANK)
  if (leftover(started) < 0 && offers.length > 0) {
    warnings.push("Certaines sources n'ont pas eu le temps de répondre.")
  }

  const rankingProfile = {
    ...defaultProfile,
    seeking: query,
    city: input.city,
    kinds: input.kinds,
  }
  offers.sort(
    (a, b) =>
      a.zoneRank - b.zoneRank ||
      (a.distanceKm ?? 999) - (b.distanceKm ?? 999) ||
      scoreOffer(rankingProfile, b) - scoreOffer(rankingProfile, a),
  )
  const furthest = offers.reduce((rank, offer) => Math.max(rank, offer.zoneRank), -1)
  const scopeLabel =
    furthest < 0
      ? "aucun rayon"
      : furthest >= FRANCE_RANK
        ? "jusqu'en France"
        : zoneLabel(place?.city || input.city, RINGS_KM[furthest] ?? 150)

  return {
    offers,
    place,
    warnings,
    fetchedAt: new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date()),
    scopeLabel,
  }
}
