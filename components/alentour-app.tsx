"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { Bookmark, Compass, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { buildDraft } from "@/lib/draft"
import {
  KIND_LABEL,
  SOURCE_LABEL,
  type Kind,
  type Offer,
  type OfferDetail,
  type OfferSource,
} from "@/lib/offers"
import {
  STATUS_LABEL,
  draftFor,
  getClientStore,
  getServerStore,
  parseBackup,
  setClientStore,
  subscribeStore,
  type Application,
  type ApplicationStatus,
  type Store,
} from "@/lib/storage"

type Tab = "pistes" | "suivi" | "profil"

type SearchPayload = {
  offers: Offer[]
  warnings: string[]
  fetchedAt: string
  scopeLabel: string
  place: { city: string; label: string } | null
}

const KIND_ORDER: Kind[] = ["stage", "alternance", "job", "junior"]

const SOURCE_TONE: Record<OfferSource, string> = {
  lba: "bg-[oklch(0.78_0.14_75)]",
  francetravail: "bg-[oklch(0.62_0.14_255)]",
  linkedin: "bg-[oklch(0.55_0.14_240)]",
  hellowork: "bg-[oklch(0.65_0.18_15)]",
  freework: "bg-[oklch(0.72_0.17_145)]",
}

export function AlentourApp() {
  const store = useSyncExternalStore(subscribeStore, getClientStore, getServerStore)
  const [tab, setTab] = useState<Tab>("pistes")
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<SearchPayload | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Offer | null>(null)
  const [detail, setDetail] = useState<OfferDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [siteLoading, setSiteLoading] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")

  const tracked = useMemo(
    () =>
      Object.values(store.applications).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [store.applications],
  )

  function patchProfile(partial: Partial<Store["profile"]>) {
    setClientStore({ ...store, profile: { ...store.profile, ...partial } })
  }

  function toggleKind(kind: Kind) {
    const kinds = store.profile.kinds.includes(kind)
      ? store.profile.kinds.filter((item) => item !== kind)
      : [...store.profile.kinds, kind]
    patchProfile({ kinds })
  }

  async function search() {
    setSearching(true)
    setSearchError(null)
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: store.profile.seeking,
          city: store.profile.city,
          kinds: store.profile.kinds,
        }),
      })
      const payload = (await response.json()) as SearchPayload & { error?: string }
      if (!response.ok) {
        setSearchError(payload.error || "La recherche a échoué.")
        return
      }
      setResult(payload)
    } catch {
      setSearchError("Pas de réseau, ou le serveur ne répond pas.")
    } finally {
      setSearching(false)
    }
  }

  function openOffer(offer: Offer) {
    setSelected(offer)
    setDetail(null)
    setDetailError(null)
    const existing = store.applications[offer.id]
    const draft = draftFor(store.profile, offer, existing)
    setSubject(draft.subject)
    setBody(draft.body)
    setDetailLoading(true)
    void fetch("/api/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(offer),
    })
      .then(async (response) => {
        const payload = (await response.json()) as OfferDetail & { error?: string }
        if (!response.ok) throw new Error(payload.error || "Détail indisponible.")
        setDetail(payload)
        if (!existing?.body) {
          const next = buildDraft(store.profile, payload)
          setSubject(next.subject)
          setBody(next.body)
        }
      })
      .catch((error: unknown) => {
        setDetailError(error instanceof Error ? error.message : "Détail indisponible.")
      })
      .finally(() => setDetailLoading(false))
  }

  function saveApplication(status: ApplicationStatus, offer: Offer) {
    const snapshot: Offer =
      detail && detail.id === offer.id
        ? {
            ...offer,
            title: detail.title,
            organization: detail.organization,
            city: detail.city,
            contract: detail.contract,
            description: detail.description.slice(0, 4000),
            url: detail.applyUrl || detail.url,
            kinds: detail.kinds,
          }
        : offer
    const next: Application = {
      offer: snapshot,
      status,
      subject,
      body,
      updatedAt: new Date().toISOString(),
    }
    setClientStore({
      ...store,
      applications: { ...store.applications, [offer.id]: next },
    })
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`)
      toast.success("Brouillon copié.")
      if (selected) saveApplication(store.applications[selected.id]?.status === "envoye" ? "envoye" : "brouillon", selected)
    } catch {
      toast.error("La copie a échoué. Sélectionne le texte à la main.")
    }
  }

  function openMail() {
    if (!selected) return
    const email = detail?.emails[0] ?? ""
    const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    saveApplication("envoye", selected)
    window.location.href = href
  }

  async function lookForEmail() {
    const website = detail?.website
    if (!website) {
      toast.error("Aucun site public sur cette offre.")
      return
    }
    setSiteLoading(true)
    try {
      const response = await fetch("/api/site-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: website }),
      })
      const payload = (await response.json()) as { emails?: string[]; error?: string }
      if (!response.ok) throw new Error(payload.error || "Lecture impossible.")
      const emails = payload.emails ?? []
      if (emails.length === 0) {
        toast("Aucun email écrit sur la page d'accueil.")
        return
      }
      setDetail((current) =>
        current ? { ...current, emails: [...new Set([...current.emails, ...emails])] } : current,
      )
      toast.success(emails.length > 1 ? `${emails.length} emails publics trouvés.` : `Email public : ${emails[0]}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lecture impossible.")
    } finally {
      setSiteLoading(false)
    }
  }

  function exportStore() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "alentour-profil.json"
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importStore(file: File) {
    try {
      const parsed = parseBackup(JSON.parse(await file.text()))
      if (!parsed) {
        toast.error("Ce fichier n'est pas un profil Alentour.")
        return
      }
      setClientStore(parsed)
      toast.success("Profil importé sur cet appareil.")
    } catch {
      toast.error("Fichier illisible.")
    }
  }

  const active = detail ?? selected
  const savedStatus = selected ? store.applications[selected.id]?.status : undefined

  const city = store.profile.city || "ta ville"

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg md:max-w-5xl pb-28">
      <Hero tab={tab} city={city} tracked={tracked.length} />

      {tab === "pistes" && (
        <section className="space-y-4 px-4 pt-5">
          <Card className="gap-4 rounded-[1.6rem] p-4 shadow-[0_18px_40px_-28px_rgba(24,20,40,0.35)] md:p-5">
            <div className="space-y-2">
              <Label htmlFor="seeking">Ce que tu cherches</Label>
              <Input
                id="seeking"
                value={store.profile.seeking}
                placeholder="vendeur, développeur, logistique…"
                className="h-11"
                onChange={(event) => patchProfile({ seeking: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">En priorité</Label>
              <Input
                id="city"
                value={store.profile.city}
                className="h-11"
                onChange={(event) => patchProfile({ city: event.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {KIND_ORDER.map((kind) => {
                const on = store.profile.kinds.includes(kind)
                return (
                  <Button
                    key={kind}
                    type="button"
                    variant={on ? "default" : "outline"}
                    className="h-10 rounded-full px-3.5"
                    aria-pressed={on}
                    onClick={() => toggleKind(kind)}
                  >
                    {KIND_LABEL[kind]}
                  </Button>
                )
              })}
            </div>
            <Button
              type="button"
              className="h-12 w-full rounded-2xl text-base font-semibold"
              disabled={searching}
              onClick={() => void search()}
            >
              {searching ? "Je regarde autour, puis plus loin…" : `Chercher depuis ${city}`}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Sans métier précis, je prends les offres proches. Les emails masqués par le recruteur restent masqués : je ne garde que ceux écrits publiquement, le téléphone, et le lien pour postuler.
            </p>
          </Card>

          {searchError && (
            <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {searchError}
            </Card>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-1">
                <div>
                  <p className="font-heading text-4xl leading-none tracking-tight">
                    {result.offers.length === 0 ? "0" : result.offers.length}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {result.offers.length === 0
                      ? `Aucune piste, même ${result.scopeLabel}.`
                      : `piste${result.offers.length > 1 ? "s" : ""} · ${result.scopeLabel}`}
                  </p>
                </div>
                <p className="max-w-40 text-right text-xs text-muted-foreground">{result.fetchedAt}</p>
              </div>
              {result.warnings.length > 0 && (
                <Card className="bg-accent p-3 text-sm text-accent-foreground">
                  {result.warnings.join(" ")}
                </Card>
              )}
              {result.offers.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground">
                  Rien en stage, alternance, job étudiant ou premier emploi pour « {store.profile.seeking || "cette recherche"} ». Change un mot, ou décoche un type trop strict.
                </Card>
              ) : (
                <div className="space-y-5">
                  <OfferGroup
                    title={`Autour de ${result.place?.city || city}`}
                    offers={result.offers.filter((offer) => offer.zoneLabel !== "Ailleurs en France")}
                    applications={store.applications}
                    onOpen={openOffer}
                  />
                  <OfferGroup
                    title="Plus loin en France"
                    note="Il n’y avait plus assez d’offres dans le rayon, alors la recherche a continué."
                    offers={result.offers.filter((offer) => offer.zoneLabel === "Ailleurs en France")}
                    applications={store.applications}
                    onOpen={openOffer}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Sources lues : La bonne alternance, France Travail, LinkedIn, HelloWork et Free-Work. Indeed et Welcome to the Jungle ne laissent pas une liste publique stable, donc ils ne sont pas branchés. Ouvre toujours l’annonce d’origine avant d’envoyer.
              </p>
            </div>
          )}
        </section>
      )}

      {tab === "suivi" && (
        <section className="space-y-3 px-4 pt-4">
          {tracked.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">
              Les offres que tu ouvres et les mails que tu prépares restent ici, sur cet appareil seulement.
            </Card>
          ) : (
            <ul className="space-y-2">
              {tracked.map((item) => (
                <li key={item.offer.id}>
                  <button
                    type="button"
                    className="w-full rounded-[1.25rem] border border-white/80 bg-card p-3 text-left shadow-[0_12px_30px_-22px_rgba(27,23,51,0.7)]"
                    onClick={() => {
                      setTab("pistes")
                      openOffer(item.offer)
                    }}
                  >
                    <Badge variant="secondary">{STATUS_LABEL[item.status]}</Badge>
                    <p className="mt-2 font-medium">{item.offer.title}</p>
                    <p className="text-sm text-muted-foreground">{item.offer.organization}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "profil" && (
        <section className="space-y-4 px-4 pt-5">
          <Card className="gap-3 rounded-[1.6rem] p-4 shadow-[0_18px_40px_-28px_rgba(24,20,40,0.35)]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" value={store.profile.firstName} onChange={(value) => patchProfile({ firstName: value })} />
              <Field label="Nom" value={store.profile.lastName} onChange={(value) => patchProfile({ lastName: value })} />
            </div>
            <Field label="Email" value={store.profile.email} onChange={(value) => patchProfile({ email: value })} type="email" />
            <Field label="Téléphone" value={store.profile.phone} onChange={(value) => patchProfile({ phone: value })} type="tel" />
            <Field label="École ou formation" value={store.profile.school} onChange={(value) => patchProfile({ school: value })} />
            <Field label="Niveau" value={store.profile.level} onChange={(value) => patchProfile({ level: value })} placeholder="BTS MCO, L3 info…" />
            <div className="space-y-2">
              <Label htmlFor="availability">Disponibilité</Label>
              <Input
                id="availability"
                className="h-11"
                placeholder="dès septembre, 2 jours école / 3 jours entreprise"
                value={store.profile.availability}
                onChange={(event) => patchProfile({ availability: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pitch">Deux lignes sur toi</Label>
              <Textarea
                id="pitch"
                className="min-h-24"
                placeholder="Ce que tu sais faire, et ce que tu veux apprendre."
                value={store.profile.pitch}
                onChange={(event) => patchProfile({ pitch: event.target.value })}
              />
            </div>
          </Card>
          <Card className="gap-3 rounded-[1.6rem] border-white/70 p-4 shadow-[0_24px_50px_-28px_rgba(27,23,51,0.55)]">
            <p className="font-heading text-xl">Sauvegarde</p>
            <p className="text-sm text-muted-foreground">
              Exporte le fichier si tu changes de téléphone. Ne le mets pas sur GitHub : il contient tes coordonnées et tes brouillons.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-full px-4" onClick={exportStore}>
                Exporter
              </Button>
              <Label className="inline-flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm">
                Importer
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importStore(file)
                    event.target.value = ""
                  }}
                />
              </Label>
            </div>
          </Card>
        </section>
      )}

      <nav className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div className="grid w-full max-w-sm grid-cols-3 rounded-full border bg-white/95 p-1.5 shadow-[0_12px_40px_-18px_rgba(24,20,40,0.45)] backdrop-blur">
          {(
            [
              ["pistes", "Pistes", Compass],
              ["suivi", "Suivi", Bookmark],
              ["profil", "Profil", UserRound],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`flex h-12 items-center justify-center gap-1.5 rounded-full text-sm ${tab === id ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setTab(id)}
            >
              <Icon className="size-4" />
              {label}
              {id === "suivi" && tracked.length > 0 ? ` ${tracked.length}` : ""}
            </button>
          ))}
        </div>
      </nav>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-[1.8rem] border-0 px-4 pb-8">
          {active && (
            <>
              <SheetHeader className="px-0">
                <SheetTitle className="pr-8 font-heading text-2xl leading-tight tracking-tight">{active.title}</SheetTitle>
                <SheetDescription>
                  {[active.organization, active.city].filter(Boolean).join(" · ")}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap gap-1.5">
                {active.kinds.map((kind) => (
                  <Badge key={kind} variant="secondary">
                    {KIND_LABEL[kind]}
                  </Badge>
                ))}
                {active.spontaneous && <Badge variant="outline">Candidature spontanée</Badge>}
                <Badge variant="outline">{SOURCE_LABEL[active.source]}</Badge>
              </div>
              <div className="space-y-3 rounded-[1.25rem] bg-secondary p-3 text-sm">
                <p className="font-medium">Pour postuler</p>
                {detailLoading && <p className="text-muted-foreground">Je lis l’annonce pour trouver l’email et le lien.</p>}
                {detailError && <p className="text-destructive">{detailError}</p>}
                {detail?.emails.length ? (
                  <ul className="space-y-1">
                    {detail.emails.map((email) => (
                      <li key={email}>
                        <a className="font-medium underline" href={`mailto:${email}`}>
                          {email}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !detailLoading && (
                    <p className="text-muted-foreground">
                      {detail?.hiddenEmail
                        ? "L’email du recruteur est masqué sur cette annonce. Le lien pour postuler est juste en dessous."
                        : "Aucun email écrit publiquement. Le lien pour postuler ouvre la candidature."}
                    </p>
                  )
                )}
                {detail?.phone && (
                  <a className="block font-medium underline" href={`tel:${detail.phone}`}>
                    {detail.phone}
                  </a>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="h-10 rounded-full"
                    nativeButton={false}
                    render={<a href={detail?.applyUrl || active.url} target="_blank" rel="noreferrer" />}
                  >
                    Postuler
                  </Button>
                  {(detail?.applyUrl || active.url) !== active.url && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full"
                      nativeButton={false}
                      render={<a href={active.url} target="_blank" rel="noreferrer" />}
                    >
                      Voir l’annonce
                    </Button>
                  )}
                  {detail?.website && !detail.emails.length && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full"
                      disabled={siteLoading}
                      onClick={() => void lookForEmail()}
                    >
                      {siteLoading ? "Lecture du site…" : "Chercher sur le site"}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap text-foreground/90">
                {(detail?.description || active.description || "Pas de description dans la liste.").slice(0, 1800)}
              </p>
              <div className="space-y-2">
                <Label htmlFor="subject">Objet</Label>
                <Input id="subject" className="h-11" value={subject} onChange={(event) => setSubject(event.target.value)} />
                <Label htmlFor="body">Mail</Label>
                <Textarea id="body" className="min-h-56" value={body} onChange={(event) => setBody(event.target.value)} />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-0"
                  onClick={() => {
                    const next = buildDraft(store.profile, detail ?? active)
                    setSubject(next.subject)
                    setBody(next.body)
                  }}
                >
                  Réécrire avec le profil
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => void copyDraft()}>
                  Copier
                </Button>
                <Button type="button" className="h-11 rounded-2xl" onClick={openMail}>
                  Ouvrir le mail
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["vu", "envoye", "relance", "passe"] as ApplicationStatus[]).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    variant={savedStatus === status ? "default" : "secondary"}
                    className="h-9"
                    onClick={() => {
                      saveApplication(status, selected!)
                      toast.success(STATUS_LABEL[status])
                    }}
                  >
                    {STATUS_LABEL[status]}
                  </Button>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Hero({ tab, city, tracked }: { tab: Tab; city: string; tracked: number }) {
  const title = tab === "pistes" ? "Alentour" : tab === "suivi" ? "Suivi" : "Profil"
  const text =
    tab === "pistes"
      ? `Stages, alternances, jobs étudiants et premiers emplois. D’abord ${city}, puis plus loin seulement s’il le faut.`
      : tab === "suivi"
        ? tracked === 0
          ? "Les offres que tu prépares restent ici, sur cet appareil seulement."
          : `${tracked} candidature${tracked > 1 ? "s" : ""} gardée${tracked > 1 ? "s" : ""} sur ce téléphone.`
        : "Ces infos écrivent tes mails. Elles restent dans ce navigateur : un pote qui ouvre Alentour part de zéro."

  return (
    <header className="px-5 pt-7 md:px-8">
      <h1 className="font-heading text-5xl leading-none tracking-tight">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{text}</p>
    </header>
  )
}

function OfferGroup({
  title,
  note,
  offers,
  applications,
  onOpen,
}: {
  title: string
  note?: string
  offers: Offer[]
  applications: Store["applications"]
  onOpen: (offer: Offer) => void
}) {
  if (offers.length === 0) return null
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="font-heading text-xl tracking-tight">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {offers.map((offer) => (
          <li key={offer.id}>
            <button
              type="button"
              className="flex w-full gap-3 rounded-[1.25rem] border bg-card p-3.5 text-left shadow-[0_10px_24px_-20px_rgba(24,20,40,0.8)]"
              onClick={() => onOpen(offer)}
            >
              <span className={`mt-1 w-1 shrink-0 self-stretch rounded-full ${SOURCE_TONE[offer.source]}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{offer.city || "Ville non précisée"}</span>
                  {offer.distanceKm != null && offer.distanceKm > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground">{offer.distanceKm} km</span>
                  )}
                </span>
                <span className="mt-1 block font-heading text-lg leading-tight tracking-tight">{offer.title}</span>
                <span className="mt-1 block truncate text-sm text-muted-foreground">{offer.organization}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {offer.kinds.map((kind) => (
                    <Badge key={kind} variant="secondary" className="rounded-full">
                      {KIND_LABEL[kind]}
                    </Badge>
                  ))}
                  {offer.spontaneous && (
                    <Badge variant="outline" className="rounded-full">
                      Spontanée
                    </Badge>
                  )}
                  {applications[offer.id] && (
                    <Badge className="rounded-full">{STATUS_LABEL[applications[offer.id].status]}</Badge>
                  )}
                  <span className="self-center text-xs text-muted-foreground">
                    {SOURCE_LABEL[offer.source]}
                    {offer.contract ? ` · ${offer.contract}` : ""}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-")
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        className="h-11"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
