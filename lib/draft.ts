import { KIND_LABEL, type Kind, type Offer } from "./offers"

export type Profile = {
  firstName: string
  lastName: string
  email: string
  phone: string
  city: string
  school: string
  level: string
  seeking: string
  pitch: string
  availability: string
  cv: string
  kinds: Kind[]
}

export const defaultProfile: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  city: "Lille",
  school: "",
  level: "",
  seeking: "",
  pitch: "",
  availability: "",
  cv: "",
  kinds: ["stage", "alternance", "job", "junior"],
}

export type Draft = {
  subject: string
  body: string
}

function fullName(profile: Profile): string {
  const name = [profile.firstName.trim(), profile.lastName.trim()].filter(Boolean).join(" ")
  return name || "Prénom Nom"
}

function kindSentence(offer: Offer, profile: Profile): string {
  if (offer.spontaneous) {
    const target = profile.seeking.trim() || offer.title
    return `une alternance en ${target}`
  }
  const kind = offer.kinds[0]
  const label = kind ? KIND_LABEL[kind].toLowerCase() : "opportunité"
  if (kind === "job") return `un job étudiant (${offer.title})`
  if (kind === "stage") return `un stage (${offer.title})`
  return `une ${label} (${offer.title})`
}

export function buildDraft(profile: Profile, offer: Offer): Draft {
  const name = fullName(profile)
  const city = profile.city.trim() || offer.city || "Lille"
  const seeking = profile.seeking.trim()
  const subject = offer.spontaneous
    ? `Candidature spontanée – ${seeking || offer.title} – ${name}`
    : `Candidature – ${offer.title} – ${name}`

  const who = [
    profile.level.trim() && profile.school.trim()
      ? `${profile.level.trim()} à ${profile.school.trim()}`
      : profile.school.trim() || profile.level.trim(),
  ]
    .filter(Boolean)
    .join("")

  const intro = who
    ? `Je suis ${who}, basé à ${city}.`
    : `Je suis basé à ${city}.`

  const place = (offer.city || city).trim()
  const located = !place ? "" : /\d/.test(place) ? ` à ${place}` : ` autour de ${place}`
  const ask = offer.spontaneous
    ? `Je vous écris parce que ${offer.organization || "votre entreprise"} recrute potentiellement en alternance${located}, sans offre publiée au moment où je cherche. Je souhaite ${kindSentence(offer, profile)}.`
    : `Je vous écris au sujet de votre offre « ${offer.title} »${offer.organization ? ` chez ${offer.organization}` : ""}${place ? ` (${place})` : ""}. Je cherche ${kindSentence(offer, profile)}.`

  const linesFromCv = pickCvLines(profile.cv, offer)
  const pitch = profile.pitch.trim()
    ? profile.pitch.trim()
    : seeking
      ? `Ce que je cherche en ce moment : ${seeking}.`
      : "Je peux vous en dire plus sur mon parcours de vive voix."
  const focus =
    linesFromCv.length > 0
      ? `Dans mon CV, je mets en avant :\n${linesFromCv.map((line) => `– ${line}`).join("\n")}`
      : ""
  const fact = offerFact(offer)

  const availability = profile.availability.trim()
    ? `Disponibilité : ${profile.availability.trim()}.`
    : ""

  const contact = [name, profile.phone.trim(), profile.email.trim()].filter(Boolean).join("\n")
  const lines = ["Bonjour,", "", intro, "", ask]
  if (fact) lines.push("", fact)
  lines.push("", pitch)
  if (focus) lines.push("", focus)
  if (availability) lines.push("", availability)
  lines.push(
    "",
    "Je joins mon CV à ce message et je reste disponible pour en parler.",
    "",
    "Bien cordialement,",
    contact,
  )

  return { subject, body: lines.join("\n") }
}

const CV_STOP = new Set([
  "avec",
  "dans",
  "pour",
  "stage",
  "offre",
  "cette",
  "votre",
  "nous",
  "vous",
  "etudiant",
  "étudiant",
])

export function pickCvLines(cv: string, offer: Offer, limit = 2): string[] {
  const lines = cv
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length >= 24 && line.length <= 220)
  if (lines.length === 0) return []
  const words = new Set(wordsOf(`${offer.title} ${offer.description} ${offer.organization}`))
  const ranked = lines
    .map((line) => ({
      line,
      score: wordsOf(line).filter((word) => words.has(word)).length,
    }))
    .sort((a, b) => b.score - a.score || b.line.length - a.line.length)
  const matching = ranked.filter((item) => item.score > 0).slice(0, limit)
  return (matching.length > 0 ? matching : ranked.slice(0, limit)).map((item) => item.line)
}

export function offerFact(offer: Offer): string {
  const sentence = offer.description
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find((part) => part.length >= 40 && part.length <= 220)
  if (!sentence) return ""
  return `L’annonce précise : « ${sentence.replace(/[«»"]/g, "")} »`
}

function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-zàâäéèêëïîôùûüç0-9]+/)
    .filter((word) => word.length > 3 && !CV_STOP.has(word))
}

export function buildRelance(profile: Profile, offer: Offer, sentOn: string | null): Draft {
  const name = fullName(profile)
  const when = sentOn ? ` le ${formatFrenchDay(sentOn)}` : ""
  const place = offer.city.trim()
  return {
    subject: `Relance – ${offer.title} – ${name}`,
    body: [
      "Bonjour,",
      "",
      `Je me permets de revenir vers vous au sujet de ma candidature pour « ${offer.title} »${offer.organization ? ` chez ${offer.organization}` : ""}${place ? ` (${place})` : ""}, envoyée${when}.`,
      "",
      "Je reste disponible pour en parler et je peux adapter mes dates si besoin.",
      "",
      "Bien cordialement,",
      [name, profile.phone.trim(), profile.email.trim()].filter(Boolean).join("\n"),
    ].join("\n"),
  }
}

export function formatFrenchDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number)
  if (!year || !month || !date) return day
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)))
}
