import { jsonError, publicMessage, readJsonBody } from "@/lib/api"
import { allowRequest, clientKey, tooManyRequests } from "@/lib/rate-limit"
import { readPublicEmails } from "@/lib/site-email"

export const maxDuration = 10

export async function POST(request: Request) {
  if (!allowRequest(clientKey(request, "site-email"), 6, 60_000)) return tooManyRequests()
  let body: unknown
  try {
    body = await readJsonBody(request, 2_000)
  } catch (error) {
    return jsonError(publicMessage(error, "Requête illisible."), 400)
  }
  const url = (body as { url?: unknown })?.url
  if (typeof url !== "string" || url.length > 500) {
    return jsonError("Pas de site à lire.", 400)
  }
  try {
    return Response.json(await readPublicEmails(url))
  } catch (error) {
    return jsonError(publicMessage(error, "Lecture du site impossible."), 422)
  }
}
