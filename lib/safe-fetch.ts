import http from "node:http"
import https from "node:https"
import { parseHttpUrl, resolvePublicAddress } from "./ssrf"
import { EXTERNAL_USER_AGENT } from "./http"

const DEFAULT_TIMEOUT_MS = 4_000
const DEFAULT_MAX_BYTES = 350_000

type PublicPage = {
  status: number
  headers: Headers
  body: Uint8Array
  url: URL
}

function requestPinned(
  url: URL,
  address: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<PublicPage> {
  const lib = url.protocol === "https:" ? https : http
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80
  const path = `${url.pathname}${url.search}` || "/"

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        host: address,
        family: address.includes(":") ? 6 : 4,
        port,
        path,
        method: "GET",
        servername: hostname,
        setHost: false,
        timeout: timeoutMs,
        headers: {
          Host: hostname,
          "User-Agent": EXTERNAL_USER_AGENT,
          Accept: "text/html,text/plain;q=0.9",
          "Accept-Language": "fr-FR,fr;q=0.9",
          Connection: "close",
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            req.destroy()
            reject(new Error("La page du site est trop lourde."))
            return
          }
          chunks.push(chunk)
        })
        res.on("end", () => {
          const headers = new Headers()
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers.set(key, value)
            else if (Array.isArray(value)) headers.set(key, value.join(", "))
          }
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Uint8Array.from(Buffer.concat(chunks)),
            url,
          })
        })
        res.on("error", reject)
      },
    )
    req.on("timeout", () => {
      req.destroy()
      reject(new Error("Le site de l'entreprise ne répond pas."))
    })
    req.on("error", () => reject(new Error("Le site de l'entreprise ne répond pas.")))
    req.end()
  })
}

export async function fetchPublicPage(rawUrl: string): Promise<PublicPage> {
  let current = rawUrl
  for (let hop = 0; hop < 3; hop += 1) {
    const url = parseHttpUrl(current)
    const address = await resolvePublicAddress(url)
    const page = await requestPinned(url, address, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_BYTES)
    if (page.status >= 300 && page.status < 400) {
      const location = page.headers.get("location")
      if (!location) throw new Error("Le site a renvoyé une redirection vide.")
      current = new URL(location, url).toString()
      continue
    }
    return page
  }
  throw new Error("Le site redirige trop loin.")
}
