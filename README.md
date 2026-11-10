# Alentour

Application TypeScript pour centraliser une recherche de **stage**, **alternance**, **job étudiant** ou **premier emploi** à partir d’une ville, puis élargir le rayon uniquement si le vivier local est insuffisant.

Le projet est un outil personnel. Il agrège des offres publiques, prépare un brouillon de candidature côté client, et n’envoie aucun message à la place de l’utilisateur.

![Aperçu d’Alentour](docs/demo.jpg)

## Fonctionnalités

- Recherche multi-sources avec expansion progressive du rayon géographique
- Classement des offres du jour : nouvelles d’abord, déjà vues ensuite
- Extraction des contacts **déjà publics** (email écrit, téléphone, lien de candidature)
- Génération d’un brouillon de mail à partir du profil et de deux extraits du CV collé, sans invention de contenu
- Suivi local des candidatures et rappel de relance à 7 jours
- Profil, CV, brouillons et historique stockés dans `localStorage` (aucune base utilisateur)

## Architecture

| Couche | Rôle |
| --- | --- |
| `app/` | Interface Next.js et routes API (`/api/search`, `/api/offer`, `/api/site-email`) |
| `lib/` | Agrégation des sources, scoring, SSRF, quotas, persistance navigateur |
| `components/` | UI métier (recherche, fiches, suivi, profil) |

Le navigateur n’envoie au serveur que le métier, la ville et les types d’offres. Le CV et les coordonnées restent sur l’appareil. Les routes API sont publiques, limitées en débit, et n’acceptent pas d’URL cliente arbitraire pour le détail HelloWork.

## Stack

- TypeScript, React 19, Next.js
- Routes serveur sans clé tierce (sources publiques uniquement)
- Tests `node:test` (`lib/logic.test.ts`)

## Sources d’offres

| Source | Usage |
| --- | --- |
| [La bonne alternance](https://labonnealternance.apprentissage.beta.gouv.fr) | Alternances et candidatures spontanées |
| [France Travail](https://candidat.francetravail.fr) | Annonces publiques |
| [LinkedIn](https://www.linkedin.com/jobs) | Cartes invité |
| [HelloWork](https://www.hellowork.com) | Stages et alternances |
| [Free-Work](https://www.free-work.com) | Stages et profils juniors |

Indeed et Welcome to the Jungle ne sont pas interrogés : leur listing n’est pas exploitable proprement. Une partie de leurs offres remonte déjà via France Travail. Chaque carte conserve le lien vers l’annonce d’origine.

## Démarrage

```bash
npm install
npm test
npm run dev
```

Interface locale : [http://127.0.0.1:3000](http://127.0.0.1:3000).

```bash
npm run build
npm start
```

Aucune variable d’environnement applicative n’est requise.

## Données

- Stockage local : clé `alentour.v1`
- Export / import JSON depuis l’onglet Profil (ne pas versionner ce fichier)
- Page de transparence : [`/confidentialite`](./app/confidentialite/page.tsx)

## Licence

Projet personnel, usage à vos risques. Pas de licence open-source ni de support utilisateur.
