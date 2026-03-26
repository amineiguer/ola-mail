import ConnectGmail from "@/components/ConnectGmail";
import { Building2 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-zinc-800" />
          <span className="text-sm font-semibold text-zinc-800 tracking-tight">OLA</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 tracking-wide">BETA</span>
        </div>
        <ConnectGmail compact />
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-12">
        <div className="max-w-lg w-full text-center">
          <p className="text-xs font-medium text-zinc-400 tracking-widest uppercase mb-6">
            Assistant IA pour agents immobiliers
          </p>
          <h1 className="text-[2.75rem] font-bold text-zinc-900 tracking-tight leading-[1.1] mb-4">
            Votre boîte mail,<br />enfin organisée.
          </h1>
          <p className="text-[15px] text-zinc-500 leading-relaxed mb-10 max-w-sm mx-auto">
            OLA détecte vos contrats immobiliers dans Gmail et les classe automatiquement dans GoHighLevel.
          </p>
          <ConnectGmail />
          <p className="mt-4 text-xs text-zinc-400">Lecture seule · OAuth 2.0 · Aucune donnée stockée</p>
        </div>
      </main>

      <footer className="px-8 py-4 border-t border-zinc-100 text-center">
        <span className="text-xs text-zinc-300">© 2026 OLA</span>
      </footer>
    </div>
  );
}
