"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
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

const KIND_ORDER: Kind[] = ["stage", "alternance", "job"]

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

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg pb-24">
      <header className="px-4 pt-6 pb-2">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Pour toi, à 0 €</p>
        <h1 className="font-heading text-4xl leading-none text-foreground">Alentour</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Stages, alternances et jobs étudiants. On commence par {store.profile.city || "ta ville"}, puis on s’éloigne seulement s’il le faut.
        </p>
      </header>

      {tab === "pistes" && (
        <section className="space-y-4 px-4">
          <Card className="gap-4 p-4">
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
                    className="h-10"
                    aria-pressed={on}
                    onClick={() => toggleKind(kind)}
                  >
                    {KIND_LABEL[kind]}
                  </Button>
                )
              })}
            </div>
            <Button type="button" className="h-11 w-full" disabled={searching} onClick={() => void search()}>
              {searching ? "Je regarde autour, puis plus loin…" : `Chercher depuis ${store.profile.city || "ta ville"}`}
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
              <div>
                <p className="font-heading text-2xl">
                  {result.offers.length === 0
                    ? "Aucune piste"
                    : `${result.offers.length} piste${result.offers.length > 1 ? "s" : ""}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result.offers.length === 0
                    ? `Même en élargissant ${result.scopeLabel}. Essaie d’autres mots.`
                    : `Rayon parcouru : ${result.scopeLabel}. Lu le ${result.fetchedAt} (heure de Paris).`}
                </p>
              </div>
              {result.warnings.length > 0 && (
                <Card className="bg-accent p-3 text-sm text-accent-foreground">
                  {result.warnings.join(" ")}
                </Card>
              )}
              {result.offers.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground">
                  Rien en stage, alternance ou job étudiant pour « {store.profile.seeking || "cette recherche"} ». Change un mot, ou décoche un type trop strict.
                </Card>
              ) : (
                <ul className="space-y-2">
                  {result.offers.map((offer) => (
                    <li key={offer.id}>
                      <button
                        type="button"
                        className="w-full rounded-xl border bg-card p-3 text-left shadow-sm"
                        onClick={() => openOffer(offer)}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {offer.kinds.map((kind) => (
                            <Badge key={kind} variant="secondary">
                              {KIND_LABEL[kind]}
                            </Badge>
                          ))}
                          {offer.spontaneous && <Badge variant="outline">Spontanée</Badge>}
                          {store.applications[offer.id] && (
                            <Badge>{STATUS_LABEL[store.applications[offer.id].status]}</Badge>
                          )}
                        </div>
                        <p className="mt-2 font-medium">{offer.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {[offer.organization, offer.city].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {offer.zoneLabel}
                          {offer.contract ? ` · ${offer.contract}` : ""} · {SOURCE_LABEL[offer.source]}
                        </p>
                        {offer.description && (
                          <p className="mt-2 line-clamp-2 text-sm">{offer.description}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Sources : La bonne alternance (alternance et entreprises à contacter) et France Travail (stages, alternances, jobs). Ouvre toujours l’annonce d’origine avant d’envoyer.
              </p>
            </div>
          )}
        </section>
      )}

      {tab === "suivi" && (
        <section className="space-y-3 px-4">
          <h2 className="font-heading text-3xl">Suivi</h2>
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
                    className="w-full rounded-xl border bg-card p-3 text-left"
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
        <section className="space-y-4 px-4">
          <div>
            <h2 className="font-heading text-3xl">Ton profil</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Il sert à écrire les mails. Il reste dans ce navigateur : un pote qui ouvre Alentour part de zéro, avec ses propres offres.
            </p>
          </div>
          <Card className="gap-3 p-4">
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
          <Card className="gap-3 p-4">
            <p className="font-medium">Sauvegarde</p>
            <p className="text-sm text-muted-foreground">
              Exporte le fichier si tu changes de téléphone. Ne le mets pas sur GitHub : il contient tes coordonnées et tes brouillons.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={exportStore}>
                Exporter
              </Button>
              <Label className="inline-flex h-10 cursor-pointer items-center rounded-lg border px-3 text-sm">
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

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {(
            [
              ["pistes", "Pistes"],
              ["suivi", "Suivi"],
              ["profil", "Profil"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`h-14 text-sm ${tab === id ? "font-semibold text-primary" : "text-muted-foreground"}`}
              onClick={() => setTab(id)}
            >
              {label}
              {id === "suivi" && tracked.length > 0 ? ` (${tracked.length})` : ""}
            </button>
          ))}
        </div>
      </nav>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-4 pb-8">
          {active && (
            <>
              <SheetHeader className="px-0">
                <SheetTitle className="pr-8 font-heading text-2xl">{active.title}</SheetTitle>
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
              <p className="text-sm whitespace-pre-wrap text-foreground/90">
                {(detail?.description || active.description || "Pas de description dans la liste.").slice(0, 1800)}
              </p>
              {detailLoading && <p className="text-sm text-muted-foreground">Je lis l’annonce…</p>}
              {detailError && <p className="text-sm text-destructive">{detailError}</p>}
              <Separator />
              <div className="space-y-2 text-sm">
                <p className="font-medium">Contact public</p>
                {detail?.emails.length ? (
                  <ul>
                    {detail.emails.map((email) => (
                      <li key={email}>
                        <a className="underline" href={`mailto:${email}`}>
                          {email}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    {detail?.hiddenEmail
                      ? "Le recruteur a un email, mais il est masqué. Passe par le lien de candidature."
                      : "Aucun email écrit dans l’annonce."}
                  </p>
                )}
                {detail?.phone && (
                  <a className="block underline" href={`tel:${detail.phone}`}>
                    {detail.phone}
                  </a>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    nativeButton={false}
                    render={<a href={detail?.applyUrl || active.url} target="_blank" rel="noreferrer" />}
                  >
                    Voir l’offre
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={siteLoading || !detail?.website}
                    onClick={() => void lookForEmail()}
                  >
                    {siteLoading ? "Lecture du site…" : "Email sur le site"}
                  </Button>
                </div>
              </div>
              <Separator />
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
                <Button type="button" variant="outline" className="h-11" onClick={() => void copyDraft()}>
                  Copier
                </Button>
                <Button type="button" className="h-11" onClick={openMail}>
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
