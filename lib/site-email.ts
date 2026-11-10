import { extractEmails } from "./emails"
import { decodeHtml } from "./html"
import { fetchPublicPage } from "./safe-fetch"

export async function emailsOnSite(url: string | null): Promise<string[]> {
  if (!url || !/^https?:\/\//i.test(url)) return []
  try {
    return (await readPublicEmails(url)).emails
  } catch {
    return []
  }
}

export async function readPublicEmails(rawUrl: string): Promise<{ emails: string[]; finalUrl: string }> {
  const page = await fetchPublicPage(rawUrl)
  if (page.status < 200 || page.status >= 300) {
    throw new Error("Le site de l'entreprise ne répond pas.")
  }
  const type = page.headers.get("content-type") || ""
  if (type && !/text\/html|text\/plain|application\/xhtml/.test(type)) {
    throw new Error("Le site ne montre pas de page lisible.")
  }
  const text = decodeHtml(new TextDecoder().decode(page.body))
  return { emails: extractEmails(text), finalUrl: page.url.toString() }
}
