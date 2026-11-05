# Audit Alentour — novembre 2026

Audit **lecture seule** (aucun correctif applicatif). Périmètre : dépôt `alentour` (Next.js 16), site live [https://alentour-tau.vercel.app](https://alentour-tau.vercel.app), APIs `/api/search`, `/api/offer`, `/api/site-email`, sources LBA, France Travail, LinkedIn guest, HelloWork, Free-Work, géocodage `api-adresse.data.gouv.fr`.

Méthode : `npm install` / `npm test` (11/11 OK) / `npm run build` (OK) / `next start` local ; sondage HTTP du live et des sources ; lecture du code (`lib/*`, `app/api/*`, `components/alentour-app.tsx`). Les logs runtime Vercel de l’équipe `lkhedma` n’étaient pas accessibles (403) : pas de confirmation d’erreurs 504 en production via le dashboard.

---

## 1. Ce qui est cassé, et pourquoi

### Verdict

La **page d’accueil fonctionne** (HTTP 200, HTML Next.js). La recherche **répond aujourd’hui** (live ~1–2 s, local ~4,6 s, HTTP 200, dizaines d’offres). Il n’y a **aucune clé API manquante** : le README a raison, le projet n’en utilise pas. Ce que Walid décrit (« mon site ne fonctionne plus ») correspond surtout à un **échec produit / sources fragiles**, pas à un site down.

Le cœur métier (« charger les offres → ouvrir une piste → email ou lien pour postuler → suivre ») **se casse à l’étape contact**, et la liste par défaut **n’aide pas un L3 info**.

### 1.1 Symptôme utilisateur : « ça ne marche plus » alors que le 200 est vert

| Observation | Preuve |
| --- | --- |
| Homepage live | `GET /` → **200** en 0,25 s |
| `POST /api/search` Lille, tous les types, requête vide | **200** en 0,94 s, **43 offres**, 0 warning, sources : FT 25, LBA 15, LinkedIn 1, HelloWork 1, Free-Work 1 |
| `POST /api/search` « informatique » | **200** en 1,6 s, 40 offres |
| `POST /api/offer` (5 sources) | **200** pour toutes |
| `POST /api/site-email` | SSRF localhost → **422** « Adresse du site refusée » (OK) |
| Build / tests | `next build` OK ; `tsx --test lib/logic.test.ts` **11 pass** |

Pas de `.env`, pas de `vercel.json`, pas de `maxDuration`. Aucune clé expirée à renouveler.

### 1.2 Cause racine n°1 — presque aucun vrai contact recruteur (P0)

Sur un échantillon live d’une offre par source :

| Source | Emails | Téléphone | Lien « postuler » réel |
| --- | --- | --- | --- |
| France Travail | aucun | aucun | partenaire Aplitrak (correct) |
| LinkedIn | aucun | aucun | **page d’inscription LinkedIn** (`/signup/cold-join?...`) |
| HelloWork | aucun | aucun | ancre `#postuler` sur HelloWork |
| Free-Work | aucun | aucun | page mission Free-Work |
| LBA (partenaire RH Alternance) | **`utilisateur@exemple.com`** | aucun | URL partenaire, description = « Descriptif du poste : » (44 caractères) |

`/api/site-email` sur la fiche entreprise RH Alternance **renvoie le même faux email**. `extractEmails` bloque `exemple.fr` et `example.com`, **pas `exemple.com`**. La lecture du site recruteur, présentée comme filet de sécurité, **pollue** les contacts.

Conséquence UX : la fiche dit « Aucun email écrit publiquement » (cas normal) **ou** affiche un email factice. « Ouvrir le mail » fait un `mailto:` **sans destinataire** dans le premier cas, et un destinataire poubelle dans le second. L’utilisateur conclut que le site est cassé.

**Plan de correctif**

1. Étendre la liste d’emails factices (`exemple.com`, `test.com`, `email.invalid`, motifs `utilisateur@`, `noreply@` génériques).
2. Ne pas afficher un email tant qu’il n’a pas passé un filtre de plausibilité.
3. Pour LinkedIn : si le href contient `signup` / `authwall`, **ignorer** et garder `jobs/view/{id}` + message « postuler sur LinkedIn (compte souvent requis) ».
4. Désactiver ou fortement borner `emailsOnSite` (allowlist de domaines d’entreprise, pas les agrégateurs).
5. UX : bouton principal = **Postuler sur l’annonce** ; « Ouvrir le mail » **désactivé** s’il n’y a pas d’email.

### 1.3 Cause racine n°2 — recherche par défaut inutilisable pour un étudiant info (P0)

Profil par défaut : ville Lille, **mot-clé vide**, **4 types cochés** (stage, alternance, job, junior). Au premier chargement du jour, `useEffect` lance `search()` tout seul.

Résultat live (requête vide) : apprentis boulanger / caisse, avocats juniors, freelance Java Experis, stages Eiffage… **Aucune priorisation métier**. Walid (L3 info) ouvre l’app et ne voit pas « ses » stages.

Le champ « Ce que tu cherches » est sur **Pistes**, pas dans **Profil** — facile à rater. `scoreOffer` n’est utilisé que pour « Préparer les candidatures », **pas pour trier la liste**.

De plus, France Travail avec `motsCles=développement` remonte des **formations CFA** (« Formation Concepteur Développeur d’Applications en alternance ») classées `alternance` via regex. Ce ne sont pas des offres employeur.

**Plan de correctif**

1. Ne pas lancer la recherche auto tant que le mot-clé (ou au moins un type + confirmation) n’est pas renseigné ; empty state pédagogique.
2. Trier / filtrer la liste avec `scoreOffer` (ou mieux : ROME / mots du CV).
3. Exclure les intitulés `formation`, `centre de formation`, `CFA`, `titre RNCP` s’il n’y a pas d’employeur clair.
4. Préremplir pour Walid : `seeking = "développement web"` / `informatique`, types stage + alternance.

### 1.4 Cause racine n°3 — timeout Vercel probable par intermittence (P0, non reproduit aujourd’hui)

`searchOffers` enchaîne des **anneaux** 15 → 40 → 80 → 150 km, chacun avec LBA + jusqu’à 4 requêtes FT + LinkedIn + HelloWork + Free-Work (`Promise.allSettled`). Chaque `fetchExternal` a un timeout **12 s**. LinkedIn attend **1,2 s** de plus sur un 429.

Hobby Vercel : durée fonction **10 s par défaut**, **aucun** `export const maxDuration`. Si LinkedIn/HelloWork traînent, `/api/search` meurt en **504 FUNCTION_INVOCATION_TIMEOUT** alors que `/` reste 200 — exactement le récit « le site charge mais ça ne marche plus ».

Aujourd’hui les sources répondaient en &lt; 2 s sur le live : le timeout est un **risque structurel**, pas un constat du 5 nov. 2026.

**Plan de correctif**

1. `export const maxDuration = 60` sur `app/api/search/route.ts` (et offer / site-email).
2. Timeout par source **3–5 s**, pas 12 s ; **un seul anneau** d’abord, élargir seulement si &lt; N offres.
3. Ne pas faire échouer toute la recherche si une source timeout (déjà le cas via `allSettled`) **et** renvoyer un 200 partiel avant la limite Vercel (`AbortSignal.any` + budget 8 s).
4. Côté client : timeout fetch + message « sources lentes, réessaie » plutôt que « Pas de réseau ».

### 1.5 Cause racine n°4 — scrapers HTML et APIs non officielles (P1)

| Source | Mécanisme | État le 5 nov. 2026 | Risque |
| --- | --- | --- | --- |
| LBA | `GET /api/v1/search` public | 200, hits OK | `/api/v2/search` = 404 ; détail `_private/jobs` descriptions vides chez les partenaires |
| France Travail | HTML `candidat.francetravail.fr/offres/recherche` | 200, `data-id-offre` présent | **Pas l’API officielle** ; un changement de markup casse tout (tests figés sur un HTML ancien) |
| LinkedIn | `jobs-guest` | 200, 10 cartes | ToS ; apply → signup ; 429 fréquent |
| HelloWork | HTML recherche | 200, 30 `aria-label` | Parser OK aujourd’hui ; DataDome possible ; rayon ~20 km (README) |
| Free-Work | `GET /api/job_postings` + `X-Varnish-Public` | 200 Hydra | Header interne ; juniors **freelance** classés « premier emploi » |
| Adresse | `api-adresse.data.gouv.fr` | 200, citycode 59350 | Rate-limit si `keepInRing` géocode **chaque ville** d’offre |

`linkedInQueries` : si « stage » est coché, **n’envoie pas** de requête alternance LinkedIn (`else if`). Idem job vs junior. Avec les 4 types, LinkedIn ne cherche que **stage + junior**.

Free-Work n’ajoute `apprenticeship` que si aucun autre appel n’a été poussé.

**Plan de correctif**

1. France Travail : API officielle « Offres d’emploi » (OAuth client credentials) — une vraie clé, mais un contrat stable. Sinon tests de **contrat HTML** (fixture live périodique).
2. LBA : rester sur v1 ; pour `offres_emploi_partenaires`, prendre la description sur l’URL partenaire ou **exclure** si `job.description` &lt; 80 caractères.
3. LinkedIn : traiter 429/403 comme warning, jamais comme échec global ; requêtes **par type coché** (supprimer les `else if`).
4. Free-Work : filtrer `contractor` / `freelance` hors « junior » étudiant.

### 1.6 Bugs UX concrets (Pistes / Suivi / Profil)

- **« Ouvrir le mail »** (`openMail`) passe le statut à `envoye` **avant** que l’utilisateur n’envoie quoi que ce soit, même sans email. Le suivi ment.
- La nav bas n’a pas `aria-current` / `nav` nommée ; les cartes d’offres sont des `<button>` sans nom accessible riche.
- `Sheet` bas : OK mobile, mais le dock fixe `bottom-4` peut **masquer** le bas de liste (`pb-28` aide, pas testé sur petit iPhone + encoche).
- Profil : pas de champ « Ce que tu cherches » / types — incohérence.
- `localStorage` `alentour.v1` : un digest de 40 offres + suivi tient, mais **aucune sync** multi-appareils hormis export JSON (documenté).
- Si l’utilisateur **décoche tous les types**, l’API renvoie 400 « Choisis au moins un type… » — le bouton reste cliquable, ça ressemble à une panne.
- Marqueur « Nouvelle » : `rememberSeen` marque tout ce qui n’était pas dans le store, donc **tout est nouveau** au premier jour — OK ; ensuite le digest du jour n’est pas rechargé si `digest.day === today`, donc **pas de refresh auto** le même jour sauf clic.

### 1.7 Ce qui n’est pas cassé

- Install, TypeScript, build, tests unitaires de parsing **sur fixtures**.
- Géocodage Lille, filtre rayon (haversine + slack 12 km).
- SSRF basique sur `/api/site-email`.
- PWA manifeste + icônes.
- Pas de secret commité.

---

## 2. Revue pour une meilleure version

### 2.1 Qualité des offres, dédoublonnage, pertinence

- `dedupeKey` = 48 car. de titre + 36 d’orga : ignore l’ID source. Une même offre FT + LinkedIn peut rester en double si les titres diffèrent (« Stage PFE - … » vs « Stage … F/H »).
- Pas de dédup par URL canonique / SIRET / `externalId` croisé.
- `classifyText` est une regex courte : un CDI « junior » entre en « premier emploi » ; un extra restauration en « job étudiant » ; une formation CFA en « alternance ».
- `TARGET = 16` arrête l’élargissement, mais `remember` plafonne à 40 **après** push : chaque source supplémentaire peut dépasser (live = 43). Incohérent.
- Offres **spontanées LBA** (`is_algo_company`) : utiles, mais mal classées dans le bruit actuel.
- Pas de filtre date (LinkedIn a un `datetime`, FT un libellé « Publié il y a 10 jours » non normalisé).

### 2.2 Robustesse des sources

Le modèle « 0 €, 0 clé, 5 scrapers » est **volontaire** et **fragile**. LinkedIn / HelloWork / FT HTML peuvent casser **sans commit**. Indeed est déjà écarté (README) pour la même raison.

Recommandation : **2 sources officielles** (LBA + France Travail API) comme socle ; le reste en bonus avec circuit-breaker, cache 30–60 min, et pastille « source dégradée ».

### 2.3 Performance

- `keepInRing` géocode **chaque localité distincte** (N+1 vers data.gouv). Sur un anneau chargé, ça explose le budget temps.
- Pas de cache HTTP serveur (`cache: "no-store"` partout) : chaque visiteur re-scrape LinkedIn.
- `cacheComponents` / `partialPrefetching` activés : la home est statique, les API dynamiques — OK, mais n’aide pas la recherche.
- Pas de pagination UI : 40 cartes d’un coup sur mobile.

**Fix perf** : cache KV/Runtime Cache par `(city, query, kinds, jour Paris)` 15–30 min ; géocode en batch ; une passe d’anneau.

### 2.4 Mobile / design / accessibilité

- Direction visuelle claire (Outfit + Bricolage, dock flottant, pastilles source) — **bonne base mobile-first**.
- Contraste des badges « Nouvelle » vs statut à vérifier (primary sombre sur fond clair : plutôt OK).
- Pas de mode sombre réellement branché (`.dark` dans le CSS, pas de toggle).
- Focus : composants shadcn/base-ui OK ; la nav custom et les cartes-liste moins.
- `robots: noindex` : cohérent pour un outil perso, mauvais si Walid veut le partager en SEO.
- PWA sans `service worker` métier : « Ajouter à l’écran d’accueil » ouvre le site, **pas d’offline**.
- Gros titre `text-5xl` : fort, mais pousse le formulaire hors fold sur petit écran.

### 2.5 Sécurité et légalité

| Sujet | Constat |
| --- | --- |
| Secrets | Aucun ; bien. |
| APIs ouvertes | `/api/search`, `/api/offer`, `/api/site-email` **sans auth ni quota** : proxy de scraping public (coût Hobby + abus). |
| SSRF | `assertPublicUrl` + DNS lookup : correct pour le basique ; pas de protection DNS rebinding au moment du fetch. |
| `/api/_private/jobs` LBA | Endpoint **_private** ; la réponse contient un **JWT** `token` (non renvoyé au client aujourd’hui — ne pas le logger). |
| LinkedIn / HelloWork | Scraping guest **contre les CGU** habituelles. Risque de blocage IP Vercel, pas un risque pénal immédiat pour un usage perso, mais **pas publiable** comme service grand public. |
| France Travail | L’API officielle existe ; le HTML public « candidat » n’est pas un contrat. |
| Emails | Objectif « seulement contacts publics » est éthiquement bon ; le scrape homepage entreprise + faux `@exemple.com` le trahit. |
| Données perso | Profil dans `localStorage` : bon pour un outil solo ; export JSON = PII, déjà averti. |

**Fix sécu** : rate-limit (IP), CORS same-origin déjà de fait pour le browser, refuser User-Agent bots massifs, retirer LinkedIn du chemin critique, ne plus appeler d’API `_private` si LBA publie un équivalent documenté.

### 2.6 Qualité de code et tests

- Code lisible, typé, petits modules, commentaires métier en français dans le README — **niveau L3 très honnête**.
- Tests = **parsers sur HTML inventé**, pas d’essai d’intégration réseau, pas de test du plafond 40, pas du JWT LBA, pas du `else if` LinkedIn.
- `openMail` / timeout Vercel / emails factices **non couverts**.
- ESLint config Next présent ; pas exécuté en CI visible dans le repo (pas de `.github/workflows` dans l’arbre audité).
- Dépendance npm `cn` en plus de `clsx`/`class-variance-authority` : bruit.

### 2.7 Idées de fonctionnalités qui feraient la différence

Pour un chercheur de stage **étudiant**, le marché est saturé d’agrégateurs. Alentour peut gagner sur **le rayon + le geste de candidature**, pas sur le volume.

1. **Filtre « vrai stage / vraie alternance près de moi »** avec carte (Metropole Lilloise) et transport (durée TER/métro, pas seulement km).
2. **Candidature en 2 tap** : CV PDF local + lettre générée + deep-link *seulement* si email réel, sinon checklist « postuler sur le site + cocher envoyé ».
3. **Mode « semaine de candidatures »** : 5 pistes scorées / jour, relance J+7 déjà là — en faire le **écran d’accueil**.
4. **Preuve de pertinence** : « 3 mots de ton CV collent à l’annonce » (déjà `pickCvLines`) affiché **sur la carte**, pas seulement dans le brouillon.
5. **Alerte du soir** (notification PWA ou mail que Walid s’envoie) : « 4 nouvelles offres info &lt; 15 km ».
6. **SIRET / page entreprise** via API Recherche Entreprises (data.gouv) au lieu de scraper la homepage.
7. **Partage de profil chiffré** (lien one-time) pour passer téléphone → ordi sans GitHub.
8. **Anti-ghosting** : statut « pas de réponse » automatique J+14, modèle de relance déjà écrit.
9. **Exclure ESN / freelance** par défaut pour un L3 (Free-Work Experis).
10. **Mode « spontané LBA uniquement »** quand il n’y a plus d’offres publiées — déjà dans les données, pas dans l’UI.

---

## 3. Liste priorisée (P0 / P1 / P2)

Effort : **S** = quelques heures, **M** = une journée de code, **L** = plusieurs sous-systèmes.

### P0 — le site « redevient utilisable »

| # | Action | Effort | Effet |
| --- | --- | --- | --- |
| P0.1 | Filtrer emails factices ; ne jamais montrer `utilisateur@exemple.com` | S | Confiance contact |
| P0.2 | Ne pas marquer « Envoyée » sur simple clic mailto ; exiger un email | S | Suivi honnête |
| P0.3 | `maxDuration` + budget temps + timeouts courts par source | S | Moins de 504 intermittents |
| P0.4 | Recherche auto : exiger un métier / empty state L3 | S | Plus de « ça marche pas » au 1er écran |
| P0.5 | LinkedIn apply : détecter signup/authwall | S | Lien Postuler utile |
| P0.6 | Trier la liste par `scoreOffer` + exclure formations CFA | M | Pertinence Lille info |

### P1 — robustesse

| # | Action | Effort |
| --- | --- | --- |
| P1.1 | Cache journalier des recherches (Runtime Cache) | M |
| P1.2 | France Travail API officielle **ou** tests de contrat HTML live | L / M |
| P1.3 | Circuit-breaker par source + warnings visibles (déjà partiel) | M |
| P1.4 | Corriger `linkedInQueries` / Free-Work alternance (`else if`) | S |
| P1.5 | Rate-limit `/api/*` | S |
| P1.6 | Arrêter `emailsOnSite` hors allowlist | S |
| P1.7 | Dédup croisée (titre normalisé + ville + orga) | S |
| P1.8 | Tests d’intégration `search` mockée + cas 429/504 | M |
| P1.9 | Accessibilité nav + `aria` sur le dock | S |

### P2 — produit qui se démarque

| # | Action | Effort |
| --- | --- | --- |
| P2.1 | Carte + temps de trajet MEL | L |
| P2.2 | Semaine de 5 candidatures + notif | M |
| P2.3 | API Recherche Entreprises (SIRET) | M |
| P2.4 | PWA offline du suivi (pas des offres) | M |
| P2.5 | CI GitHub : test + build | S |
| P2.6 | Retirer LinkedIn du chemin critique (option) | S |

---

## 4. Synthèse pour Walid

Le site **n’est pas down**. Homepage et APIs répondent. Les clés ne sont pas le problème (il n’y en a pas).

Ce qui casse l’usage :

1. **Tu n’obtiens presque jamais un email recruteur** ; parfois un faux `@exemple.com` ; LinkedIn t’envoie vers l’inscription.
2. **Sans mot-clé**, Alentour te noie sous toutes les offres Lille (boulangerie, avocat, freelance).
3. **La recherche peut timeout** sur Vercel (10 s) dès qu’une source HTML rame — à surveiller, pas vu aujourd’hui.
4. Les sources **HTML / guest / `_private`** casseront encore, même si tout est vert ce soir.

Correctifs les plus rentables : emails factices, mailto, timeout fonction, empty state métier, score de pertinence, API France Travail officielle plus tard.

---

*Audit réalisé le 5 novembre 2026. Commandes de preuve : curl live `/api/search` et `/api/offer`, sondage LBA / FT / LinkedIn / HelloWork / Free-Work, `npm test`, `npm run build`.*
