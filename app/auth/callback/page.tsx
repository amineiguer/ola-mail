"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Suspense } from "react";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("Connexion à Gmail en cours...");

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(
        error === "missing_code"
          ? "Code d'autorisation manquant. Veuillez réessayer."
          : error === "token_exchange_failed"
          ? "Échec de l'échange de token. Vérifiez vos credentials Google."
          : "Accès refusé. Veuillez autoriser l'accès à Gmail pour continuer."
      );
      return;
    }

    if (success === "true") {
      setStatus("success");
      setMessage("Gmail connecté avec succès ! Redirection vers le tableau de bord...");
    } else {
      setStatus("error");
      setMessage("Réponse inattendue. Veuillez réessayer.");
      return;
    }

    const timer = setTimeout(() => {
      router.push("/dashboard");
    }, 2000);

    return () => clearTimeout(timer);
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 max-w-md w-full mx-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-800">OLA</span>
        </div>

        <div className="mb-6">
          {status === "loading" && (
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto" />
          )}
          {status === "success" && (
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
          )}
          {status === "error" && (
            <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          )}
        </div>

        <h2 className="text-xl font-semibold text-slate-800 mb-3">
          {status === "loading" && "Connexion en cours..."}
          {status === "success" && "Connexion réussie !"}
          {status === "error" && "Erreur de connexion"}
        </h2>

        <p className="text-slate-500 text-sm leading-relaxed mb-6">{message}</p>

        {status === "error" && (
          <button
            onClick={() => router.push("/")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            Retour à l&apos;accueil
          </button>
        )}

        {status === "success" && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Redirection automatique...
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 max-w-md w-full mx-4 text-center">
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Chargement...</p>
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
