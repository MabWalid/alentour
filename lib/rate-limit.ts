type Bucket = { count: number; reset: number }

const buckets = new Map<string, Bucket>()

export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  if (buckets.size > 4_000) {
    for (const [id, bucket] of buckets) {
      if (bucket.reset < now) buckets.delete(id)
    }
  }
  const current = buckets.get(key)
  if (!current || current.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

export function clientKey(request: Request, route: string): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local"
  return `${route}:${ip}`
}

export function tooManyRequests(): Response {
  return Response.json(
    { error: "Trop de requêtes. Réessaie dans une minute." },
    { status: 429, headers: { "Retry-After": "60" } },
  )
}
