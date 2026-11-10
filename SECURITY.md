# Sécurité

Alentour est un outil personnel exposé sur Internet. Les routes `/api/*` n’ont pas d’authentification : elles sont durcies pour limiter l’abus, pas pour servir un produit multi-tenant.

## Contrôles en place

- HelloWork : URL d’annonce reconstruite à partir de l’identifiant, jamais depuis un champ `url` client
- Lecture d’un site d’entreprise : schéma HTTP(S) uniquement, refus des adresses privées (IPv4, IPv6 link-local / ULA, NAT64), connexion pinnée sur l’IP résolue, redirections revérifiées, plafond de taille
- Quotas mémoire par adresse IP sur la recherche, le détail d’offre et la lecture d’emails
- Corps JSON borné ; messages d’erreur filtrés
- En-têtes `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`

## Données

Le CV et les brouillons ne transitent pas par `/api/search`. Ils restent dans le navigateur. Une recherche transmet métier, ville et types d’offres au serveur, qui interroge ensuite des sites publics.

## Signalement

Ouvrir une issue sur ce dépôt. Ne pas y coller de secrets, de CV, ni de journaux contenant des données personnelles.
