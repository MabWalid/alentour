import { jsonError, publicMessage, readJsonBody } from "@/lib/api"
import { fetchFranceTravailDetail } from "@/lib/francetravail"
import { fetchFreeWorkDetail } from "@/lib/freework"
import { fetchHelloWorkDetail } from "@/lib/hellowork"
import { fetchLbaDetail } from "@/lib/lba"
import { fetchLinkedInDetail } from "@/lib/linkedin"
import { parseOfferRequest } from "@/lib/offers"
import { allowRequest, clientKey, tooManyRequests } from "@/lib/rate-limit"

export const maxDuration = 10

export async function POST(request: Request) {
  if (!allowRequest(clientKey(request, "offer"), 20, 60_000)) return tooManyRequests()
  let body: unknown
  try {
    body = await readJsonBody(request, 48_000)
  } catch (error) {
    return jsonError(publicMessage(error, "Requête illisible."), 400)
  }
  const offer = parseOfferRequest(body)
  if (!offer) return jsonError("Offre inconnue.", 400)
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
    return jsonError(publicMessage(error, "Le détail de l'offre est indisponible."), 502)
  }
}
