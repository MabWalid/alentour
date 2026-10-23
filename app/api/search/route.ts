import { isKind, type Kind } from "@/lib/offers"
import { searchOffers } from "@/lib/search"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 })
  }
  const source = (body ?? {}) as { query?: unknown; city?: unknown; kinds?: unknown }
  const query = typeof source.query === "string" ? source.query.slice(0, 120) : ""
  const city = typeof source.city === "string" && source.city.trim() ? source.city.slice(0, 80) : "Lille"
  const kinds = Array.isArray(source.kinds)
    ? source.kinds.filter((kind): kind is Kind => typeof kind === "string" && isKind(kind))
    : []
  if (kinds.length === 0) {
    return Response.json(
      { error: "Choisis au moins un type : stage, alternance ou job étudiant." },
      { status: 400 },
    )
  }
  try {
    return Response.json(await searchOffers({ query, city, kinds }))
  } catch (error) {
    const message = error instanceof Error ? error.message : "La recherche a échoué."
    return Response.json({ error: message }, { status: 502 })
  }
}
