"use client";

import { useState } from "react";
import { Loader2, CheckCircle } from "lucide-react";

interface ConnectOutlookProps {
  compact?: boolean;
  isConnected?: boolean;
  ghlUserId?: string;
  onConnected?: () => void;
}

export default function ConnectOutlook({
  compact = false,
  isConnected = false,
  ghlUserId,
  onConnected,
}: ConnectOutlookProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = () => {
    setIsLoading(true);

    const url = ghlUserId
      ? `/api/auth/outlook?userId=${encodeURIComponent(ghlUserId)}`
      : "/api/auth/outlook";

    const popup = window.open(
      url,
      "outlook-oauth",
      "width=600,height=700,scrollbars=yes,resizable=yes"
    );

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "OUTLOOK_CONNECTED") {
        window.removeEventListener("message", onMessage);
        setIsLoading(false);
        if (onConnected) {
          onConnected();
        } else {
          window.location.reload();
        }
      } else if (event.data?.type === "OUTLOOK_ERROR") {
        window.removeEventListener("message", onMessage);
        setIsLoading(false);
      }
    };
    window.addEventListener("message", onMessage);

    // Fallback: popup closed without message
    const poll = setInterval(() => {
      if (popup?.closed) {
        clearInterval(poll);
        window.removeEventListener("message", onMessage);
        setIsLoading(false);
        if (onConnected) {
          onConnected();
        } else {
          window.location.reload();
        }
      }
    }, 500);
  };

  if (isConnected) {
    return (
      <div className={`flex items-center gap-1.5 text-zinc-500 ${compact ? "text-xs" : "text-sm"}`}>
        <CheckCircle className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        Outlook connecté
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
        {isLoading ? "Connexion..." : "Connecter Outlook"}
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
      {isLoading ? "Connexion en cours..." : "Connecter Outlook"}
    </button>
  );
}
