export const EXTERNAL_USER_AGENT =
  "Mozilla/5.0 (compatible; Alentour/0.1; +https://labonnealternance.apprentissage.beta.gouv.fr)"

export const FETCH_TIMEOUT_MS = 4_000
export const SEARCH_BUDGET_MS = 7_500

export async function fetchExternal(url: string, init: RequestInit = {}): Promise<Response> {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: init.redirect ?? "follow",
    signal,
    headers: {
      "User-Agent": EXTERNAL_USER_AGENT,
      "Accept-Language": "fr-FR,fr;q=0.9",
      ...init.headers,
    },
  })
}
