import { fetchExternal } from "./http"
import type { Place } from "./offers"

type AdresseFeature = {
  properties?: {
    label?: string
    city?: string
    citycode?: string
    type?: string
  }
  geometry?: { coordinates?: [number, number] }
}

const geocodeCache = new Map<string, Promise<Place | null>>()

async function searchAdresse(
  query: string,
  municipality: boolean,
  bias?: { latitude: number; longitude: number },
): Promise<Place | null> {
  const url = new URL("https://api-adresse.data.gouv.fr/search/")
  url.searchParams.set("q", query)
  url.searchParams.set("limit", "1")
  url.searchParams.set("autocomplete", "0")
  if (municipality) url.searchParams.set("type", "municipality")
  if (bias) {
    url.searchParams.set("lat", String(bias.latitude))
    url.searchParams.set("lon", String(bias.longitude))
  }
  const response = await fetchExternal(url.toString(), { headers: { Accept: "application/json" } })
  if (!response.ok) return null
  const payload = (await response.json()) as { features?: AdresseFeature[] }
  const feature = payload.features?.[0]
  const coordinates = feature?.geometry?.coordinates
  if (!feature || !coordinates) return null
  const [longitude, latitude] = coordinates
  return {
    label: feature.properties?.label || query,
    city: feature.properties?.city || query,
    citycode: feature.properties?.citycode || null,
    latitude,
    longitude,
  }
}

export async function geocodeCity(
  query: string,
  bias?: { latitude: number; longitude: number },
): Promise<Place | null> {
  const city = query.trim()
  if (city.length < 2) return null
  const key = `${city.toLowerCase()}|${bias ? `${bias.latitude.toFixed(2)},${bias.longitude.toFixed(2)}` : ""}`
  const cached = geocodeCache.get(key)
  if (cached) return cached
  const pending = (async () => (await searchAdresse(city, true, bias)) ?? (await searchAdresse(city, false, bias)))()
  geocodeCache.set(key, pending)
  return pending
}
