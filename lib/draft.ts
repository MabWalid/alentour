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
  kinds: ["stage", "alternance", "job"],
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

  const pitch = profile.pitch.trim()
    ? profile.pitch.trim()
    : seeking
      ? `Ce que je cherche en ce moment : ${seeking}.`
      : "Je peux vous en dire plus sur mon parcours de vive voix."

  const availability = profile.availability.trim()
    ? `Disponibilité : ${profile.availability.trim()}.`
    : ""

  const contact = [name, profile.phone.trim(), profile.email.trim()].filter(Boolean).join("\n")
  const lines = ["Bonjour,", "", intro, "", ask, "", pitch]
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
