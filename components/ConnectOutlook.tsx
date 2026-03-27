"use client";

import { useState } from "react";

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

    // Open OAuth popup
    window.open(url, "outlook-oauth", "width=600,height=700,scrollbars=yes,resizable=yes");

    // Poll Supabase (via API) as the single source of truth.
    // Works regardless of window.opener (Google COOP), localStorage restrictions, or popup state.
    const poll = setInterval(async () => {
      try {
        const statusUrl = ghlUserId
          ? `/api/auth/outlook?action=status&userId=${encodeURIComponent(ghlUserId)}`
          : "/api/auth/outlook?action=status";
        const res = await fetch(statusUrl);
        if (!res.ok) return;
        const data = await res.json();
        if (data.connected) {
          clearInterval(poll);
          clearTimeout(timeout);
          setIsLoading(false);
          if (onConnected) onConnected();
          else window.location.reload();
        }
      } catch { /* ignore — will retry next tick */ }
    }, 1500);

    // Safety timeout after 5 minutes
    const timeout = setTimeout(() => {
      clearInterval(poll);
      setIsLoading(false);
    }, 5 * 60 * 1000);
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
        {isLoading ? "Connexion..." : "Connecter Outlook"}
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isLoading}
      className="btn-connect"
    >
      {isLoading ? "Connexion en cours..." : "Connecter Outlook"}
    </button>
  );
}
