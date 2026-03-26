"use client";

import { useState } from "react";
import { X, Send, Loader2, Minus } from "lucide-react";

interface ComposeModalProps {
  onClose: () => void;
  defaultTo?: string;
  defaultSubject?: string;
}

export default function ComposeModal({ onClose, defaultTo = "", defaultSubject = "" }: ComposeModalProps) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [minimized, setMinimized] = useState(false);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setSending("sending");
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), body: body.trim() }),
      });
      if (!res.ok) throw new Error();
      setSending("sent");
      setTimeout(onClose, 1200);
    } catch {
      setSending("error");
    }
  };

  return (
    <div className="fixed bottom-0 right-6 z-50 w-[480px] shadow-2xl rounded-t-xl overflow-hidden border border-[#3c4043] flex flex-col bg-white dark:bg-[#2d2e30]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-[#404040] dark:bg-[#1a1a1a] cursor-pointer select-none"
        onClick={() => setMinimized((v) => !v)}
      >
        <span className="text-[13px] font-medium text-white truncate">
          {subject.trim() || "Nouveau message"}
        </span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMinimized((v) => !v)}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <Minus className="w-3.5 h-3.5 text-white" />
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Fields */}
          <div className="flex flex-col border-b border-[#e0e0e0] dark:border-[#3c4043]">
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="À"
              autoFocus
              className="px-4 py-2.5 text-[13px] bg-transparent text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none border-b border-[#e0e0e0] dark:border-[#3c4043]"
            />
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet"
              className="px-4 py-2.5 text-[13px] bg-transparent text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none"
            />
          </div>

          {/* Body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Rédigez votre message…"
            className="flex-1 px-4 py-3 text-[13px] bg-transparent text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none resize-none"
            style={{ minHeight: 220 }}
          />

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e0e0e0] dark:border-[#3c4043]">
            {sending === "error" && (
              <span className="text-[12px] text-[#c5221f] dark:text-[#f28b82]">Échec de l&apos;envoi</span>
            )}
            {sending === "sent" && (
              <span className="text-[12px] text-[#137333] dark:text-[#81c995]">Message envoyé ✓</span>
            )}
            {sending !== "error" && sending !== "sent" && <span />}

            <button
              onClick={handleSend}
              disabled={sending === "sending" || !to.trim() || !subject.trim() || !body.trim()}
              className="flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white text-[13px] font-medium px-5 py-2 rounded-full transition-colors"
            >
              {sending === "sending"
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Envoi…</>
                : <><Send className="w-3.5 h-3.5" /> Envoyer</>
              }
            </button>
          </div>
        </>
      )}
    </div>
  );
}
