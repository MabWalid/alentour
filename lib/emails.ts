const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

const BLOCKED_HOSTS = [
  "exemple.fr",
  "example.com",
  "email.com",
  "sentry.io",
  "wixpress.com",
  "schema.org",
  "vite.com",
  "hellowork.com",
  "linkedin.com",
  "licdn.com",
  "francetravail.fr",
  "pole-emploi.fr",
  "free-work.com",
]

const OBFUSCATED = /([a-z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\{at\}| arobase | chez )\s*([a-z0-9.-]+\.[a-z]{2,})/gi

export function extractEmails(text: string): string[] {
  const normalized = text
    .replace(/%40/gi, "@")
    .replace(/mailto:/gi, " ")
    .replace(OBFUSCATED, "$1@$2")
    .replace(/&#0*64;|&commat;/gi, "@")
  const found = normalized.match(EMAIL_PATTERN) ?? []
  const unique: string[] = []
  for (const raw of found) {
    const email = raw.replace(/[.,;:)]+$/g, "").toLowerCase()
    const host = email.split("@")[1] ?? ""
    if (host.length < 4 || host.startsWith(".") || host.endsWith(".")) continue
    if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      continue
    }
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(email)) continue
    if (!unique.includes(email)) unique.push(email)
    if (unique.length >= 8) break
  }
  return unique
}
