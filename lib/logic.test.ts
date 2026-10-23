import assert from "node:assert/strict"
import test from "node:test"
import { buildDraft, defaultProfile } from "./draft"
import { extractEmails } from "./emails"
import { parseFranceTravailHtml } from "./francetravail"
import { decodeHtml } from "./html"
import { classifyText, dedupeKey, matchesKinds, zoneLabel } from "./offers"
import { isPrivateAddress } from "./ssrf"
import { parseBackup } from "./storage"

test("classify stages, alternance and student jobs", () => {
  assert.deepEqual(classifyText("Stage de vente à Lille"), ["stage"])
  assert.deepEqual(classifyText("Contrat d'apprentissage"), ["alternance"])
  assert.ok(classifyText("Étudiant, temps partiel").includes("job"))
  assert.equal(matchesKinds(["stage"], ["alternance", "job"]), false)
  assert.equal(matchesKinds(["job"], ["job"]), true)
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
  assert.deepEqual(
    extractEmails("Écrire à contact@boulangerie.fr ou noreply@exemple.fr et logo@cdn.png"),
    ["contact@boulangerie.fr"],
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
