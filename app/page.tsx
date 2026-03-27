"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConnectGmail from "@/components/ConnectGmail";
import ConnectOutlook from "@/components/ConnectOutlook";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // On mount: if already connected, go straight to the mailbox
  useEffect(() => {
    const check = async () => {
      try {
        const [gRes, oRes] = await Promise.all([
          fetch("/api/auth/gmail?action=status"),
          fetch("/api/auth/outlook?action=status"),
        ]);
        const gData = gRes.ok ? await gRes.json() : { connected: false };
        const oData = oRes.ok ? await oRes.json() : { connected: false };
        if (gData.connected || oData.connected) {
          router.replace("/dashboard");
          return;
        }
      } catch { /* ignore — show connect page */ }
      setChecking(false);
    };
    check();
  }, [router]);

  const goToDashboard = () => router.replace("/dashboard");

  if (checking) {
    return (
      <div className="connect-screen">
        <div className="connect-screen-spinner" />
      </div>
    );
  }

  return (
    <div className="connect-screen">
      <div className="connect-screen-header">
        <div className="connect-screen-logo">
          <span className="connect-screen-logo-text">Boîte courriel</span>
        </div>
        <p className="connect-screen-sub">Connectez votre boîte mail pour commencer</p>
      </div>
      <div className="connect-buttons">
        <ConnectGmail onConnected={goToDashboard} />
        <ConnectOutlook onConnected={goToDashboard} />
      </div>
      <footer className="connect-screen-footer">
        <a href="/privacy">Confidentialité</a>
        <span>·</span>
        <a href="/terms">Conditions</a>
      </footer>
    </div>
  );
}
