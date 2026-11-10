import { jsonError, publicMessage, readJsonBody } from "@/lib/api"
import { isKind, type Kind } from "@/lib/offers"
import { allowRequest, clientKey, tooManyRequests } from "@/lib/rate-limit"
import { searchOffers } from "@/lib/search"

export const maxDuration = 10

export async function POST(request: Request) {
  if (!allowRequest(clientKey(request, "search"), 8, 60_000)) return tooManyRequests()
  let body: unknown
  try {
    body = await readJsonBody(request, 4_000)
  } catch (error) {
    return jsonError(publicMessage(error, "Requête illisible."), 400)
  }
  const source = (body ?? {}) as { query?: unknown; city?: unknown; kinds?: unknown }
  const query = typeof source.query === "string" ? source.query.slice(0, 120) : ""
  const city = typeof source.city === "string" && source.city.trim() ? source.city.slice(0, 80) : "Lille"
  const kinds = Array.isArray(source.kinds)
    ? source.kinds.filter((kind): kind is Kind => typeof kind === "string" && isKind(kind))
    : []
  if (kinds.length === 0) {
    return jsonError("Choisis au moins un type : stage, alternance ou job étudiant.", 400)
  }
  try {
    return Response.json(await searchOffers({ query, city, kinds }))
  } catch (error) {
    return Response.json({
      offers: [],
      place: null,
      warnings: [publicMessage(error, "La recherche a échoué.")],
      fetchedAt: new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date()),
      scopeLabel: "aucun rayon",
    })
  }
}
