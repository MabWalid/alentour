import { searchFranceTravail } from "./francetravail"
import { searchFreeWork } from "./freework"
import { geocodeCity } from "./geocode"
import { searchHelloWork } from "./hellowork"
import { searchLba } from "./lba"
import { searchLinkedIn } from "./linkedin"
import { keepInRing } from "./near"
import {
  dedupeKey,
  matchesKinds,
  zoneLabel,
  type Kind,
  type Offer,
  type Place,
} from "./offers"

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
    if (seenIds.has(offer.id)) continue
    const textKey = dedupeKey(offer)
    if (seenText.has(textKey)) continue
    seenIds.add(offer.id)
    seenText.add(textKey)
    bucket.push(offer)
    if (bucket.length >= 40) return
  }
}

export async function searchOffers(input: {
  query: string
  city: string
  kinds: Kind[]
}): Promise<SearchResult> {
  const warnings: string[] = []
  const offers: Offer[] = []
  const seenIds = new Set<string>()
  const seenText = new Set<string>()
  const place = await geocodeCity(input.city).catch(() => null)
  if (!place) {
    warnings.push(`Je n'ai pas trouvé « ${input.city} » sur la carte. Je cherche dans toute la France.`)
  }

  const pull = async (km: number | null, rank: number) => {
    const tasks: Promise<Offer[]>[] = []
    if (input.kinds.includes("alternance")) {
      tasks.push(
        searchLba({
          query: input.query,
          latitude: km != null && place ? place.latitude : undefined,
          longitude: km != null && place ? place.longitude : undefined,
          radiusKm: km != null && place ? km : undefined,
        }),
      )
    }
    for (const ftQuery of franceTravailQueries(input.query, input.kinds)) {
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
      tasks.push(searchLinkedIn({ query: input.query, city, kinds: input.kinds }))
      tasks.push(searchHelloWork({ query: input.query, city, kinds: input.kinds }))
      tasks.push(searchFreeWork({ query: input.query, city, kinds: input.kinds }))
    }
    const settled = await Promise.allSettled(tasks)
    for (const result of settled) {
      if (result.status === "fulfilled") {
        const local = km != null && place ? await keepInRing(result.value, place, km) : result.value
        remember(offers, seenIds, seenText, stamp(local, place?.city || input.city, km, rank), input.kinds)
      } else {
        const message = result.reason instanceof Error ? result.reason.message : "Une source n'a pas répondu."
        if (!warnings.includes(message)) warnings.push(message)
      }
    }
  }

  if (place) {
    for (const [index, km] of RINGS_KM.entries()) {
      await pull(km, index)
      if (offers.length >= TARGET) break
    }
  }
  if (offers.length < 8) await pull(null, FRANCE_RANK)

  offers.sort((a, b) => a.zoneRank - b.zoneRank || (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
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
