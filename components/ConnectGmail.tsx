"use client";

import { useState } from "react";

interface ConnectGmailProps {
  compact?: boolean;
  isConnected?: boolean;
  ghlUserId?: string;
  onConnected?: () => void;
}

export default function ConnectGmail({ compact = false, isConnected = false, ghlUserId, onConnected }: ConnectGmailProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = () => {
    setIsLoading(true);

    const url = ghlUserId
      ? `/api/auth/gmail?userId=${encodeURIComponent(ghlUserId)}`
      : "/api/auth/gmail";

    const popup = window.open(
      url,
      "gmail-oauth",
      "width=600,height=700,scrollbars=yes,resizable=yes"
    );

    const finish = () => {
      setIsLoading(false);
      if (onConnected) onConnected();
      else window.location.reload();
    };

    // Primary: localStorage event — works even when window.opener is null (Google COOP headers)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ola-oauth-connected") {
        cleanup();
        finish();
      }
    };

    // Secondary: postMessage from popup
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "GMAIL_CONNECTED" || e.data?.type === "OUTLOOK_CONNECTED") {
        cleanup();
        finish();
      } else if (e.data?.type === "GMAIL_ERROR" || e.data?.type === "OUTLOOK_ERROR") {
        cleanup();
        setIsLoading(false);
      }
    };

    // Fallback: detect popup closed without any event
    const poll = setInterval(() => {
      if (popup?.closed) {
        cleanup();
        finish();
      }
    }, 500);

    const cleanup = () => {
      clearInterval(poll);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
  };

  if (isConnected) {
    return (
      <div className={`btn-connected-indicator${compact ? " btn-connected-indicator--compact" : ""}`}>
        Connecté
      </div>
    );
  }

  if (compact) {
    return (
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className="btn-connect-compact"
      >
        {isLoading ? "Connexion..." : "Connecter Gmail"}
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isLoading}
      className="btn-connect"
    >
      {isLoading ? "Connexion en cours..." : "Connecter Gmail"}
    </button>
  );
}
