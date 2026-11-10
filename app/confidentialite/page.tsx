import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Données et confidentialité — Alentour",
  robots: { index: false, follow: false },
}

export default function ConfidentialitePage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg space-y-5 px-5 py-8 md:max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/" className="underline">
          Retour à Alentour
        </Link>
      </p>
      <h1 className="font-heading text-4xl tracking-tight">Données et confidentialité</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Alentour est un outil personnel, sans compte. Cette page dit ce qui reste sur ton téléphone, et ce qui
        transite par le serveur pour aller chercher des offres publiques.
      </p>
      <section className="space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-xl">Sur ton appareil seulement</h2>
        <p>
          Le prénom, le nom, l’email, le téléphone, l’école, le CV collé, les brouillons et le suivi sont enregistrés
          dans le navigateur (<code>localStorage</code>). Ils ne sont pas envoyés à Alentour pour créer un profil
          serveur. Un autre téléphone, ou un autre navigateur, part de zéro. Pour changer d’appareil : Exporter /
          Importer dans Profil.
        </p>
      </section>
      <section className="space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-xl">Ce qui passe par le serveur</h2>
        <p>
          Quand tu lances une recherche, le serveur reçoit le métier, la ville et les types d’offres, puis interroge
          des sites publics : La bonne alternance, France Travail, LinkedIn (pages invité), HelloWork, Free-Work, et
          le géocodeur{" "}
          <a className="underline" href="https://adresse.data.gouv.fr">
            api-adresse.data.gouv.fr
          </a>
          . L’adresse IP est visible de Vercel, comme pour n’importe quel site. Le CV n’est pas transmis dans cette
          requête.
        </p>
        <p>
          Ouvrir une fiche peut lire l’annonce d’origine. Si un site d’entreprise est indiqué, Alentour peut lire la
          page d’accueil pour y chercher un email déjà écrit publiquement.
        </p>
      </section>
      <section className="space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-xl">Hébergement</h2>
        <p>
          Le site est hébergé par Vercel. Il n’y a pas de base de comptes Alentour. Les mails de candidature partent
          depuis ton application mail, pas depuis nos serveurs.
        </p>
      </section>
      <section className="space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-xl">Contact</h2>
        <p>
          Projet personnel, code sur{" "}
          <a className="underline" href="https://github.com/MabWalid/alentour">
            GitHub
          </a>
          . Pour une question sur tes données, ouvre une issue sur ce dépôt.
        </p>
      </section>
    </main>
  )
}
