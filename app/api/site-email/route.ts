import { readPublicEmails } from "@/lib/site-email"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 })
  }
  const url = (body as { url?: unknown })?.url
  if (typeof url !== "string" || url.length > 500) {
    return Response.json({ error: "Pas de site à lire." }, { status: 400 })
  }
  try {
    return Response.json(await readPublicEmails(url))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lecture du site impossible."
    return Response.json({ error: message }, { status: 422 })
  }
}
