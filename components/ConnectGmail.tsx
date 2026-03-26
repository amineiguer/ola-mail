"use client";

import { useState } from "react";
import { Loader2, CheckCircle } from "lucide-react";

interface ConnectGmailProps {
  compact?: boolean;
  isConnected?: boolean;
  ghlUserId?: string;
}

export default function ConnectGmail({ compact = false, isConnected = false, ghlUserId }: ConnectGmailProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = () => {
    setIsLoading(true);

    const url = ghlUserId
      ? `/api/auth/gmail?userId=${encodeURIComponent(ghlUserId)}`
      : "/api/auth/gmail";

    // Open OAuth in a popup so it works from within an iframe
    const popup = window.open(
      url,
      "gmail-oauth",
      "width=600,height=700,scrollbars=yes,resizable=yes"
    );

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "GMAIL_CONNECTED") {
        window.removeEventListener("message", onMessage);
        setIsLoading(false);
        window.location.reload();
      } else if (event.data?.type === "GMAIL_ERROR") {
        window.removeEventListener("message", onMessage);
        setIsLoading(false);
      }
    };
    window.addEventListener("message", onMessage);

    // Fallback: detect popup closed without message
    const poll = setInterval(() => {
      if (popup?.closed) {
        clearInterval(poll);
        window.removeEventListener("message", onMessage);
        setIsLoading(false);
        window.location.reload();
      }
    }, 500);
  };

  if (isConnected) {
    return (
      <div className={`flex items-center gap-1.5 text-zinc-500 ${compact ? "text-xs" : "text-sm"}`}>
        <CheckCircle className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        Gmail connecté
      </div>
    );
  }

  if (compact) {
    return (
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors disabled:opacity-40 flex items-center gap-1.5"
      >
        {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
        {isLoading ? "Connexion..." : "Connecter Gmail"}
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isLoading}
      className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm font-medium py-2.5 px-6 rounded-lg transition-colors"
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {isLoading ? "Connexion en cours..." : "Connecter Gmail"}
    </button>
  );
}
