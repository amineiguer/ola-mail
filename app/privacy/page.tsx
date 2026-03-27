import Link from "next/link";
import { Building2 } from "lucide-react";

export const metadata = {
  title: "Politique de confidentialité – OLA",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-8 py-5 flex items-center gap-2 border-b border-zinc-100">
        <Link href="/" className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-zinc-800" />
          <span className="text-sm font-semibold text-zinc-800 tracking-tight">OLA</span>
        </Link>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-6 py-12 w-full">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Politique de confidentialité</h1>
        <p className="text-xs text-zinc-400 mb-8">Dernière mise à jour : 26 mars 2026</p>

        <section className="space-y-6 text-[15px] text-zinc-700 leading-relaxed">
          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">1. Données collectées</h2>
            <p>
              OLA accède à votre compte Gmail via OAuth 2.0 pour lire et envoyer des emails en votre nom.
              Nous stockons uniquement les jetons d&apos;accès OAuth (access token et refresh token) nécessaires
              au fonctionnement de l&apos;application. Aucun contenu d&apos;email n&apos;est stocké de manière permanente
              sur nos serveurs.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">2. Utilisation des données</h2>
            <p>
              Les données d&apos;accès Gmail sont utilisées exclusivement pour :
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Récupérer et afficher vos emails dans l&apos;interface OLA</li>
              <li>Envoyer des emails en votre nom depuis l&apos;interface OLA</li>
              <li>Classifier les emails et les synchroniser avec GoHighLevel</li>
            </ul>
            <p className="mt-2">
              Nous n&apos;utilisons pas vos données Gmail à des fins publicitaires ou de profilage.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">3. Partage des données</h2>
            <p>
              Nous ne vendons ni ne partageons vos données personnelles avec des tiers, sauf dans le cas
              de la synchronisation avec GoHighLevel (CRM) que vous avez explicitement configurée.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">4. Sécurité</h2>
            <p>
              Les jetons OAuth sont stockés de manière sécurisée dans une base de données chiffrée.
              L&apos;accès est limité à votre identifiant utilisateur GoHighLevel.
              Vous pouvez révoquer l&apos;accès à tout moment depuis les paramètres de l&apos;application
              ou depuis votre compte Google (myaccount.google.com/permissions).
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">5. Rétention des données</h2>
            <p>
              Les jetons d&apos;accès sont supprimés lorsque vous vous déconnectez de l&apos;application.
              Si votre compte est inactif pendant plus de 6 mois, les jetons sont automatiquement supprimés.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">6. Contact</h2>
            <p>
              Pour toute question concernant vos données, contactez-nous à l&apos;adresse :
              <a href="mailto:privacy@ola-mail.vercel.app" className="text-blue-600 hover:underline ml-1">
                privacy@ola-mail.vercel.app
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="px-8 py-4 border-t border-zinc-100 text-center flex items-center justify-center gap-4">
        <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-600">Accueil</Link>
        <Link href="/terms" className="text-xs text-zinc-400 hover:text-zinc-600">Conditions d&apos;utilisation</Link>
      </footer>
    </div>
  );
}
