"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, X, ChevronDown } from "lucide-react";

interface ComposePanelProps {
  onClose: () => void;
  defaultTo?: string;
  defaultSubject?: string;
}

export default function ComposePanel({ onClose, defaultTo = "", defaultSubject = "" }: ComposePanelProps) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!defaultTo) bodyRef.current?.focus();
  }, [defaultTo]);

  const canSend = to.trim() && subject.trim() && body.trim();

  const handleSend = async () => {
    if (!canSend || sending === "sending") return;
    setSending("sending");
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), body: body.trim() }),
      });
      if (!res.ok) throw new Error();
      setSending("sent");
      setTimeout(onClose, 1500);
    } catch {
      setSending("error");
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#202124]">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between pl-6 pr-4 py-3 border-b border-[#e0e0e0] dark:border-[#3c4043]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
            title="Fermer"
          >
            <X className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6]" />
          </button>
          <span className="text-[15px] font-medium text-[#202124] dark:text-[#e8eaed]">
            Nouveau message
          </span>
        </div>
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
          title="Réduire"
          onClick={onClose}
        >
          <ChevronDown className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6]" />
        </button>
      </div>

      {/* ── Fields ── */}
      <div className="flex-shrink-0 border-b border-[#e0e0e0] dark:border-[#3c4043]">
        {/* To */}
        <div className="flex items-center border-b border-[#e0e0e0] dark:border-[#3c4043] px-6">
          <span className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] w-14 flex-shrink-0">À</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            autoFocus={!defaultTo}
            placeholder="destinataire@email.com"
            className="flex-1 py-3 text-[14px] bg-transparent text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none"
          />
        </div>
        {/* Subject */}
        <div className="flex items-center px-6">
          <span className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] w-14 flex-shrink-0">Objet</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Sujet du message"
            className="flex-1 py-3 text-[14px] bg-transparent text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none"
          />
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
          placeholder="Rédigez votre message…"
          className="w-full h-full min-h-[300px] text-[14px] bg-transparent text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none resize-none leading-[1.7]"
        />
      </div>

      {/* ── Bottom bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between pl-6 pr-4 py-3 border-t border-[#e0e0e0] dark:border-[#3c4043] bg-white dark:bg-[#202124]">
        <div>
          {sending === "error" && (
            <span className="text-[12px] text-[#c5221f] dark:text-[#f28b82]">Échec de l&apos;envoi — réessayer</span>
          )}
          {sending === "sent" && (
            <span className="text-[12px] text-[#137333] dark:text-[#81c995]">Message envoyé ✓</span>
          )}
          {sending === "idle" && (
            <span className="text-[11px] text-[#9aa0a6]">⌘↵ pour envoyer</span>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={!canSend || sending === "sending" || sending === "sent"}
          className="flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] dark:bg-[#a8c7fa] dark:hover:bg-[#c2d9ff] disabled:opacity-50 text-white dark:text-[#062e6f] text-[13px] font-medium px-5 py-2.5 rounded-full transition-colors"
        >
          {sending === "sending"
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Envoi…</>
            : <><Send className="w-3.5 h-3.5" /> Envoyer</>
          }
        </button>
      </div>
    </div>
  );
}
