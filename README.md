# Alentour

Outil personnel pour chercher un **stage**, une **alternance**, un **job étudiant** ou un **premier emploi** en partant d’une ville (Lille par défaut), puis en élargissant le rayon jusqu’à la France s’il n’y a plus rien près de chez toi.

Pour chaque piste, Alentour prépare un **brouillon de mail**. Tu l’envoies toi-même. Les emails masqués par le recruteur ne sont pas récupérés : seulement ceux écrits dans l’annonce, le téléphone public, le lien pour postuler, et — si tu le demandes — les emails visibles sur la page d’accueil du site de l’entreprise.

À l’ouverture, si la liste date d’un autre jour, Alentour recharge les annonces et marque les nouvelles. Tu peux coller ton CV : la lettre reprend deux lignes qui correspondent à l’offre, sans en inventer. Le bouton **Préparer les candidatures** met de côté celles qui collent le mieux. Dans **Suivi**, tu modifies la lettre, tu ouvres le lien pour postuler, et une relance est proposée 7 jours après l’envoi. Rien n’est envoyé sans toi.

## D’où viennent les offres

Tout est gratuit, sans Apify et sans clé :

- [La bonne alternance](https://labonnealternance.apprentissage.beta.gouv.fr) : alternances et entreprises à qui envoyer une candidature spontanée.
- [France Travail](https://candidat.francetravail.fr) : stages, alternances et jobs publiés sur la recherche publique.
- [LinkedIn](https://www.linkedin.com/jobs) : annonces invité, sans compte.
- [HelloWork](https://www.hellowork.com) : stages et alternances (le rayon public reste d’environ 20 km).
- [Free-Work](https://www.free-work.com) : stages et postes juniors, surtout en tech.

Indeed bloque les lectures automatiques. Welcome to the Jungle ne publie pas une liste d’offres stable sans sa propre recherche. Beaucoup d’annonces de ces sites remontent déjà via France Travail.

Chaque carte cite la source et renvoie vers l’annonce d’origine. Relis-la avant d’envoyer quoi que ce soit.

## Tes données restent à toi

Le profil, les brouillons et le suivi sont dans le **navigateur de l’appareil** (`localStorage`). Rien n’est enregistré sur un serveur.

Un ami qui ouvre le même site part d’un profil vide. Pour passer d’un téléphone à un autre, utilise **Exporter / Importer** dans Profil. Ne commite pas ce fichier : il contient tes coordonnées.

## Lancer en local

```bash
npm install
npm test
npm run dev
```

Ouvre [http://127.0.0.1:3000](http://127.0.0.1:3000). Pour un autre port : `npm run dev -- -p 43123`.

## Le mettre sur ton téléphone, à 0 €

1. Crée le dépôt GitHub de ce projet (bouton **Create repo** dans Cursor si le projet n’est pas encore sur ton compte).
2. Va sur [vercel.com](https://vercel.com), connecte ce dépôt, laisse les réglages Next.js, et déploie. Le plan Hobby suffit, sans variable d’environnement.
3. Ouvre l’adresse Vercel dans Safari ou Chrome sur le téléphone.
4. **Ajouter à l’écran d’accueil**. Alentour s’ouvre comme une app.

## Ce que l’app ne fait pas

- Elle n’envoie aucun mail toute seule.
- Elle ne contourne pas un email que France Travail ou La bonne alternance a choisi de masquer.
- Elle ne mélange pas les profils de plusieurs personnes.
