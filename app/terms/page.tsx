import Link from "next/link";
import { Building2 } from "lucide-react";

export const metadata = {
  title: "Conditions d'utilisation – OLA",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-8 py-5 flex items-center gap-2 border-b border-zinc-100">
        <Link href="/" className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-zinc-800" />
          <span className="text-sm font-semibold text-zinc-800 tracking-tight">OLA</span>
        </Link>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-6 py-12 w-full">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Conditions d&apos;utilisation</h1>
        <p className="text-xs text-zinc-400 mb-8">Dernière mise à jour : 26 mars 2026</p>

        <section className="space-y-6 text-[15px] text-zinc-700 leading-relaxed">
          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">1. Acceptation des conditions</h2>
            <p>
              En utilisant OLA, vous acceptez les présentes conditions d&apos;utilisation.
              Si vous n&apos;acceptez pas ces conditions, veuillez ne pas utiliser l&apos;application.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">2. Description du service</h2>
            <p>
              OLA est une application d&apos;assistant email destinée aux agents immobiliers.
              Elle permet de connecter votre compte Gmail ou Outlook à GoHighLevel (CRM)
              pour classifier et synchroniser automatiquement vos emails professionnels.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">3. Utilisation autorisée</h2>
            <p>Vous vous engagez à :</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Utiliser OLA uniquement à des fins professionnelles légitimes</li>
              <li>Ne pas tenter de contourner les mécanismes de sécurité de l&apos;application</li>
              <li>Ne pas utiliser OLA pour envoyer du spam ou des communications non sollicitées</li>
              <li>Respecter les conditions d&apos;utilisation de Google et Microsoft</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">4. Accès aux données</h2>
            <p>
              OLA accède à vos emails uniquement avec votre consentement explicite via OAuth 2.0.
              Vous pouvez révoquer cet accès à tout moment depuis les paramètres de l&apos;application
              ou depuis votre compte Google / Microsoft.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">5. Limitation de responsabilité</h2>
            <p>
              OLA est fourni &quot;tel quel&quot;, sans garantie d&apos;aucune sorte. Nous ne sommes pas responsables
              des pertes de données, interruptions de service, ou dommages indirects résultant de
              l&apos;utilisation de l&apos;application.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">6. Modifications</h2>
            <p>
              Nous nous réservons le droit de modifier ces conditions à tout moment.
              Les modifications entrent en vigueur dès leur publication sur cette page.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900 mb-2">7. Contact</h2>
            <p>
              Pour toute question, contactez-nous à :
              <a href="mailto:support@ola-mail.vercel.app" className="text-blue-600 hover:underline ml-1">
                support@ola-mail.vercel.app
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="px-8 py-4 border-t border-zinc-100 text-center flex items-center justify-center gap-4">
        <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-600">Accueil</Link>
        <Link href="/privacy" className="text-xs text-zinc-400 hover:text-zinc-600">Politique de confidentialité</Link>
      </footer>
    </div>
  );
}
