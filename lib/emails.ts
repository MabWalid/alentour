const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

const BLOCKED_HOSTS = [
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

const FAKE_SLD = new Set([
  "example",
  "exemple",
  "test",
  "testing",
  "invalid",
  "localhost",
  "dummy",
  "fake",
  "sample",
  "placeholder",
])

const FAKE_LOCAL = /^(utilisateur|user|username|test|testing|tester|fake|example|exemple|demo|sample|invalid|placeholder|noreply|no-reply|no_reply|donotreply|do-not-reply|nepasrepondre|ne-pas-repondre|na|n\/a)$/i

const OBFUSCATED = /([a-z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\{at\}| arobase | chez )\s*([a-z0-9.-]+\.[a-z]{2,})/gi

export function isFakeEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  const at = normalized.lastIndexOf("@")
  if (at < 1) return true
  const local = normalized.slice(0, at).split("+")[0] ?? ""
  const host = normalized.slice(at + 1)
  if (!local || host.length < 4 || host.startsWith(".") || host.endsWith(".")) return true
  if (FAKE_LOCAL.test(local)) return true
  if (/^(noreply|no-reply|no_reply|donotreply|nepasrepondre)/i.test(local)) return true
  if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return true
  const labels = host.split(".").filter(Boolean)
  const sld = labels.length >= 2 ? labels[labels.length - 2] : labels[0]
  if (sld && FAKE_SLD.has(sld)) return true
  if (labels.some((label) => FAKE_SLD.has(label))) return true
  return false
}

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
    if (isFakeEmail(email)) continue
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(email)) continue
    if (!unique.includes(email)) unique.push(email)
    if (unique.length >= 8) break
  }
  return unique
}
