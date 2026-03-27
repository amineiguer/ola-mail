"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Connexion en cours...");

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const provider = searchParams.get("provider") ?? "gmail";
    const msgType = provider === "outlook" ? "OUTLOOK_CONNECTED" : "GMAIL_CONNECTED";
    const errType = provider === "outlook" ? "OUTLOOK_ERROR" : "GMAIL_ERROR";
    const providerName = provider === "outlook" ? "Outlook" : "Gmail";

    if (error) {
      setStatus("error");
      setMessage(
        error === "missing_code"
          ? "Code d'autorisation manquant. Veuillez réessayer."
          : error === "token_exchange_failed"
          ? "Échec de l'échange de token. Vérifiez vos credentials Google."
          : error === "insufficient_scope"
          ? "Permissions insuffisantes. Veuillez autoriser tous les accès demandés."
          : "Accès refusé. Veuillez autoriser l'accès pour continuer."
      );
      // Notify parent window of error (best-effort)
      try { if (window.opener) window.opener.postMessage({ type: errType }, "*"); } catch { /* blocked */ }
      setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 2000);
      return;
    }

    if (success === "true") {
      setStatus("success");
      setMessage(`${providerName} connecté ! Fermeture en cours...`);

      // 1. Broadcast via localStorage — works even when window.opener is null (Google COOP)
      try {
        localStorage.setItem("ola-oauth-connected", String(Date.now()));
        // Clean up after a moment so it doesn't linger
        setTimeout(() => localStorage.removeItem("ola-oauth-connected"), 3000);
      } catch { /* private browsing may block localStorage */ }

      // 2. Also try postMessage for environments where opener is still available
      try {
        if (window.opener) window.opener.postMessage({ type: msgType }, "*");
      } catch { /* COOP may block this */ }

      // 3. Close the popup — ConnectGmail's poll will also catch this as fallback
      setTimeout(() => {
        try {
          window.close();
        } catch { /* ignore */ }
        // If still open (direct navigation, not popup), redirect to dashboard
        setTimeout(() => router.push("/dashboard"), 500);
      }, 800);

      return;
    }

    // Unexpected state
    setStatus("error");
    setMessage("Réponse inattendue. Veuillez réessayer.");
  }, [searchParams, router]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-text">Boîte courriel</span>
        </div>

        <div className="auth-icon-wrap">
          {status === "loading" && <div className="auth-status-indicator">···</div>}
          {status === "success" && <div className="auth-status-indicator auth-status-indicator--ok">✓</div>}
          {status === "error"   && <div className="auth-status-indicator auth-status-indicator--err">!</div>}
        </div>

        <h2 className="auth-title">
          {status === "loading" && "Connexion en cours..."}
          {status === "success" && "Connexion réussie !"}
          {status === "error"   && "Erreur de connexion"}
        </h2>

        <p className="auth-message">{message}</p>

        {status === "error" && (
          <button onClick={() => router.push("/")} className="auth-back-btn">
            Retour à l&apos;accueil
          </button>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="auth-screen">
        <div className="auth-card">
          <p className="auth-message">Chargement...</p>
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
