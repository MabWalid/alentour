import assert from "node:assert/strict"
import test from "node:test"
import { buildDraft, buildRelance, defaultProfile, pickCvLines } from "./draft"
import { addDays, groupByCity, parisDay, rankForPreparation, relanceDue, rememberSeen } from "./prepare"
import { extractEmails } from "./emails"
import { parseFranceTravailApply, parseFranceTravailHtml } from "./francetravail"
import { helloWorkApplyUrl } from "./hellowork"
import { linkedInApplyUrl } from "./linkedin"
import { mapFreeWorkPosting } from "./freework"
import { parseHelloWorkHtml } from "./hellowork"
import { parseLinkedInHtml } from "./linkedin"
import { decodeHtml } from "./html"
import { haversineKm, isInsideRadius, offerLocality } from "./near"
import { classifyText, dedupeKey, matchesKinds, zoneLabel } from "./offers"
import { isPrivateAddress } from "./ssrf"
import { parseBackup } from "./storage"

test("classify stages, alternance, student jobs and first jobs", () => {
  assert.deepEqual(classifyText("Stage de vente à Lille"), ["stage"])
  assert.deepEqual(classifyText("Contrat d'apprentissage"), ["alternance"])
  assert.ok(classifyText("Étudiant, temps partiel").includes("job"))
  assert.ok(classifyText("Premier emploi, jeune diplômé").includes("junior"))
  assert.equal(matchesKinds(["stage"], ["alternance", "job"]), false)
  assert.equal(matchesKinds(["job"], ["job"]), true)
})

test("public board cards keep title, company and city", () => {
  const linkedin = parseLinkedInHtml(`
    <div data-entity-urn="urn:li:jobPosting:4474283391">
      <h3 class="base-search-card__title">Développeur Java - Stage</h3>
      <h4 class="base-search-card__subtitle"><a href="https://fr.linkedin.com/company/nextoo">Nextoo</a></h4>
      <span class="job-search-card__location">Roubaix</span>
      <time class="job-search-card__listdate" datetime="2026-10-05"></time>
    </div>`)
  assert.equal(linkedin[0].id, "4474283391")
  assert.equal(linkedin[0].organization, "Nextoo")
  assert.equal(linkedin[0].city, "Roubaix")

  const hello = parseHelloWorkHtml(`
    <a href="/fr-fr/emplois/84025104.html"
      aria-label="Voir offre de Développeur Fullstack - Stage H/F à Lille - 59, chez 314.talent, super recruteur, pour un Stage, en temps plein, 6 mois">
    </a>`)
  assert.equal(hello[0].id, "84025104")
  assert.equal(hello[0].organization, "314.talent")
  assert.equal(hello[0].city, "Lille - 59")
  assert.match(hello[0].contract, /^Stage/)

  const freework = mapFreeWorkPosting({
    id: 12,
    title: "Développeur Python",
    slug: "developpeur-python",
    description: "<p>Poste &agrave; Lille</p>",
    experienceLevel: "junior",
    contracts: ["permanent"],
    company: { name: "Atelier" },
    location: { shortLabel: "Lille" },
    job: { slug: "developpeur-python-django" },
    applicationContact: "jobs@atelier.fr",
  })
  assert.equal(freework?.source, "freework")
  assert.ok(freework?.kinds.includes("junior"))
  assert.equal(freework?.url, "https://www.free-work.com/fr/tech-it/job-mission/developpeur-python-django/developpeur-python")
  assert.match(freework?.description ?? "", /jobs@atelier.fr/)
})

test("a Lille search drops Nantes and keeps Roubaix", () => {
  const lille = { latitude: 50.631, longitude: 3.057 }
  const nantes = haversineKm(lille, { latitude: 47.218, longitude: -1.554 })
  const roubaix = haversineKm(lille, { latitude: 50.692, longitude: 3.175 })
  assert.ok(nantes > 500)
  assert.equal(isInsideRadius(nantes, 15), false)
  assert.equal(isInsideRadius(roubaix, 15), true)
  assert.equal(offerLocality("Nantes - 44"), "Nantes")
  assert.equal(offerLocality("44000 Nantes"), "Nantes")
  assert.equal(offerLocality("Lille - 59"), "Lille")
  assert.equal(offerLocality("59 - LYS LEZ LANNOY"), "LYS LEZ LANNOY")
})

test("zone labels start close to the city", () => {
  assert.equal(zoneLabel("Lille", 15), "Lille et tout près")
  assert.equal(zoneLabel("Lille", 80), "Dans les 80 km autour de Lille")
  assert.equal(zoneLabel("Lille", null), "Ailleurs en France")
})

test("france travail cards keep the public fields", () => {
  const html = `
    <li data-id-offre="215QDPL" class="result">
      <span class="media-heading-title">BOUCHER VENDEUR (H/F)</span>
      <p class="subtext">SARL DEJONCKHEERE - 59 - LYS LEZ LANNOY</p>
      <p class="description">Recrute un boucher en CDI.</p>
      <p class="contrat visible-xs">CDI - Temps plein</p>
      <p class="date">Publié aujourd'hui</p>
    </li>`
  const [hit] = parseFranceTravailHtml(html)
  assert.equal(hit.id, "215QDPL")
  assert.equal(hit.organization, "SARL DEJONCKHEERE")
  assert.equal(hit.city, "59 - LYS LEZ LANNOY")
  assert.match(hit.contract, /CDI/)
})

test("html entities and public emails", () => {
  assert.equal(decodeHtml("D&eacute;fense &amp; S&eacute;curit&eacute;"), "Défense & Sécurité")
  assert.equal(decodeHtml("Python &amp;amp; API"), "Python & API")
  assert.deepEqual(extractEmails('Écrire à <a href="mailto:jobs@atelier.fr">ici</a> ou contact [at] atelier.fr'), [
    "jobs@atelier.fr",
    "contact@atelier.fr",
  ])
  assert.deepEqual(extractEmails("contactezmoi@vite.com"), [])
  assert.deepEqual(
    extractEmails("Écrire à contact@boulangerie.fr ou noreply@exemple.fr et logo@cdn.png"),
    ["contact@boulangerie.fr"],
  )
})

test("apply links come from the public offer page", () => {
  const franceTravail = parseFranceTravailApply(
    JSON.stringify({
      _tapestry: {
        content: [["contactZone", "<a id='idLienPartenaire' href='https://www.recrutement.leclerc/offre?x=1&amp;y=2'>Postuler</a>"]],
        inits: ["offre/contact:init", ["offre/postulerEnLigne:init", "https://candidat.francetravail.fr/candidature/postulerenligne/1"]],
      },
    }),
  )
  assert.equal(franceTravail.applyUrl, "https://www.recrutement.leclerc/offre?x=1&y=2")
  assert.equal(
    helloWorkApplyUrl("<a href='#postuler' data-cy='applyButtonHeader'>Postuler</a>", "https://www.hellowork.com/fr-fr/emplois/1.html"),
    "https://www.hellowork.com/fr-fr/emplois/1.html#postuler",
  )
  assert.equal(
    linkedInApplyUrl('<a class="apply-link-offsite" href="https://jobs.exemple.fr/12">Postuler</a>', "https://www.linkedin.com/jobs/view/1"),
    "https://jobs.exemple.fr/12",
  )
})

test("draft uses the profile and does not invent a recipient", () => {
  const draft = buildDraft(
    {
      ...defaultProfile,
      firstName: "Camille",
      lastName: "Martin",
      city: "Lille",
      school: "IUT",
      level: "BUT 2",
      seeking: "vente",
      availability: "dès septembre",
    },
    {
      id: "lba:1",
      source: "lba",
      externalId: "1",
      title: "Vendeur",
      organization: "Brice",
      city: "Roubaix",
      contract: "Alternance",
      description: "",
      url: "https://example.com",
      kinds: ["alternance"],
      spontaneous: true,
      zoneLabel: "Lille et tout près",
      zoneRank: 0,
      distanceKm: 10,
      published: null,
    },
  )
  assert.match(draft.subject, /Camille Martin/)
  assert.match(draft.body, /Brice/)
  assert.match(draft.body, /dès septembre/)
  assert.equal(draft.body.includes("@"), false)
})

test("private addresses stay blocked", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true)
  assert.equal(isPrivateAddress("10.1.2.3"), true)
  assert.equal(isPrivateAddress("169.254.169.254"), true)
  assert.equal(isPrivateAddress("8.8.8.8"), false)
  assert.equal(isPrivateAddress("::1"), true)
})

test("daily memory, city groups, cv lines and relance dates", () => {
  const offer = {
    id: "ft:2",
    source: "francetravail" as const,
    externalId: "2",
    title: "Vendeur stage",
    organization: "Brice",
    city: "Lille - 59",
    contract: "Stage",
    description: "Accueil client en magasin à Lille, caisse et mise en rayon.",
    url: "https://example.com/offre",
    kinds: ["stage" as const],
    spontaneous: false,
    zoneLabel: "Lille et tout près",
    zoneRank: 0,
    distanceKm: 2,
    published: null,
  }
  const profile = {
    ...defaultProfile,
    seeking: "vendeur",
    cv: "Accueil client et caisse en magasin pendant six mois.\nProjet scolaire de comptabilité sans lien.",
  }
  const lines = pickCvLines(profile.cv, offer)
  assert.equal(lines[0]?.includes("Accueil client"), true)
  const draft = buildDraft(profile, offer)
  assert.match(draft.body, /Accueil client/)
  assert.match(draft.body, /L’annonce précise/)
  const memory = rememberSeen({}, [offer], "2026-10-27")
  assert.equal(memory.fresh, 1)
  assert.equal(rememberSeen(memory.seen, [offer], "2026-10-28").fresh, 0)
  assert.equal(groupByCity([offer])[0].city, "Lille")
  const ranked = rankForPreparation(profile, [offer], {})
  assert.equal(ranked[0]?.id, "ft:2")
  assert.equal(relanceDue({ status: "envoye", sentAt: "2026-10-20" }, "2026-10-27"), true)
  assert.equal(relanceDue({ status: "envoye", sentAt: "2026-10-26" }, "2026-10-27"), false)
  assert.equal(addDays("2026-10-27", 7), "2026-11-03")
  assert.match(buildRelance(profile, offer, "2026-10-20").body, /20 octobre/)
  assert.equal(parisDay(new Date("2026-10-27T23:30:00.000Z")), "2026-10-28")
})

test("backup import keeps one person's profile", () => {
  const store = parseBackup({
    profile: { firstName: "Inès", city: "Lille", kinds: ["stage", "nope"] },
    applications: {
      "ft:1": {
        status: "envoye",
        subject: "Objet",
        body: "Bonjour",
        updatedAt: "2026-10-23T12:00:00.000Z",
        offer: {
          id: "ft:1",
          source: "francetravail",
          externalId: "1",
          title: "Stage",
          kinds: ["stage"],
        },
      },
    },
  })
  assert.ok(store)
  assert.equal(store?.profile.firstName, "Inès")
  assert.deepEqual(store?.profile.kinds, ["stage"])
  assert.equal(store?.applications["ft:1"].status, "envoye")
  assert.equal(dedupeKey({ title: "Stage", organization: "ACME" }).includes("stage"), true)
})
