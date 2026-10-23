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

async function searchAdresse(query: string, municipality: boolean): Promise<Place | null> {
  const url = new URL("https://api-adresse.data.gouv.fr/search/")
  url.searchParams.set("q", query)
  url.searchParams.set("limit", "1")
  url.searchParams.set("autocomplete", "0")
  if (municipality) url.searchParams.set("type", "municipality")
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

export async function geocodeCity(query: string): Promise<Place | null> {
  const city = query.trim()
  if (city.length < 2) return null
  return (await searchAdresse(city, true)) ?? (await searchAdresse(city, false))
}
