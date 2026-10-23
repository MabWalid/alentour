import { extractEmails } from "./emails"
import { decodeHtml } from "./html"
import { EXTERNAL_USER_AGENT } from "./http"
import { assertPublicUrl } from "./ssrf"

export async function readPublicEmails(rawUrl: string): Promise<{ emails: string[]; finalUrl: string }> {
  let current = rawUrl
  for (let hop = 0; hop < 3; hop += 1) {
    const url = await assertPublicUrl(current)
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": EXTERNAL_USER_AGENT,
        Accept: "text/html,text/plain;q=0.9",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error("Le site a renvoyé une redirection vide.")
      current = new URL(location, url).toString()
      continue
    }
    if (!response.ok) throw new Error(`Le site a répondu ${response.status}.`)
    const type = response.headers.get("content-type") || ""
    if (type && !/text\/html|text\/plain|application\/xhtml/.test(type)) {
      throw new Error("Le site ne montre pas de page lisible.")
    }
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 350_000) throw new Error("La page du site est trop lourde.")
    const text = decodeHtml(new TextDecoder().decode(bytes))
    return { emails: extractEmails(text), finalUrl: url.toString() }
  }
  throw new Error("Le site redirige trop loin.")
}
