import { geocodeCity } from "./geocode"
import type { Offer, Place } from "./offers"

const SLACK_KM = 12

export function haversineKm(
  origin: { latitude: number; longitude: number },
  target: { latitude: number; longitude: number },
): number {
  const earth = 6371
  const dLat = ((target.latitude - origin.latitude) * Math.PI) / 180
  const dLon = ((target.longitude - origin.longitude) * Math.PI) / 180
  const lat1 = (origin.latitude * Math.PI) / 180
  const lat2 = (target.latitude * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function offerLocality(value: string): string {
  const first = value.split(/[·,|/]/)[0] ?? value
  return first
    .replace(/\b\d{5}\b/g, " ")
    .replace(/\s+-\s+\d{2,3}\s*$/g, " ")
    .replace(/^\d{2,3}\s+-\s+/, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function isInsideRadius(distanceKm: number, radiusKm: number): boolean {
  return distanceKm <= radiusKm + SLACK_KM
}

export async function keepInRing(offers: Offer[], place: Place, radiusKm: number): Promise<Offer[]> {
  const names = [...new Set(offers.map((offer) => offerLocality(offer.city)).filter((name) => name.length >= 2))]
  const located = new Map<string, Place | null>()
  await Promise.all(
    names.map(async (name) => {
      const found = await geocodeCity(name, place).catch(() => null)
      located.set(name, found)
    }),
  )

  const kept: Offer[] = []
  for (const offer of offers) {
    if (typeof offer.distanceKm === "number") {
      if (isInsideRadius(offer.distanceKm, radiusKm)) kept.push(offer)
      continue
    }
    const locality = offerLocality(offer.city)
    const found = located.get(locality)
    if (!found) continue
    const distanceKm = haversineKm(place, found)
    if (!isInsideRadius(distanceKm, radiusKm)) continue
    kept.push({ ...offer, distanceKm: Math.round(distanceKm) })
  }
  return kept
}
