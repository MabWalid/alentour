export const EXTERNAL_USER_AGENT =
  "Mozilla/5.0 (compatible; Alentour/0.1; +https://labonnealternance.apprentissage.beta.gouv.fr)"

export async function fetchExternal(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: init.redirect ?? "follow",
    signal: init.signal ?? AbortSignal.timeout(12_000),
    headers: {
      "User-Agent": EXTERNAL_USER_AGENT,
      "Accept-Language": "fr-FR,fr;q=0.9",
      ...init.headers,
    },
  })
}
