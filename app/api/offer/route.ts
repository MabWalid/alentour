import { fetchFranceTravailDetail } from "@/lib/francetravail"
import { fetchFreeWorkDetail } from "@/lib/freework"
import { fetchHelloWorkDetail } from "@/lib/hellowork"
import { fetchLbaDetail } from "@/lib/lba"
import { fetchLinkedInDetail } from "@/lib/linkedin"
import type { Offer, OfferSource } from "@/lib/offers"

const SOURCES: OfferSource[] = ["lba", "francetravail", "linkedin", "hellowork", "freework"]

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 })
  }
  const offer = (body ?? {}) as Offer
  if (!offer || !SOURCES.includes(offer.source) || !offer.externalId) {
    return Response.json({ error: "Offre inconnue." }, { status: 400 })
  }
  try {
    const detail =
      offer.source === "lba"
        ? await fetchLbaDetail(offer)
        : offer.source === "francetravail"
          ? await fetchFranceTravailDetail(offer)
          : offer.source === "linkedin"
            ? await fetchLinkedInDetail(offer)
            : offer.source === "hellowork"
              ? await fetchHelloWorkDetail(offer)
              : await fetchFreeWorkDetail(offer)
    return Response.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Le détail de l'offre est indisponible."
    return Response.json({ error: message }, { status: 502 })
  }
}
