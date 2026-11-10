const USER_ERRORS = new Set([
  "Requête illisible.",
  "Requête trop lourde.",
  "Choisis au moins un type : stage, alternance ou job étudiant.",
  "Offre inconnue.",
  "Pas de site à lire.",
  "Adresse du site illisible.",
  "Adresse du site refusée.",
  "Seul un site http ou https peut être lu.",
  "Le site de l'entreprise ne répond pas.",
  "Le site a renvoyé une redirection vide.",
  "Le site redirige trop loin.",
  "La page du site est trop lourde.",
  "Le site ne montre pas de page lisible.",
])

export function publicMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && USER_ERRORS.has(error.message)) return error.message
  return fallback
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") || "0")
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Requête trop lourde.")
  }
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > maxBytes) throw new Error("Requête trop lourde.")
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new Error("Requête illisible.")
  }
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}
