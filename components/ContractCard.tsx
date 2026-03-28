"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { EmailItem, LinkedContact } from "@/app/dashboard/page";
import { Tag as TagType } from "@/lib/tags-config";
import { TagChip } from "@/components/EmailList";
import {
  Upload, CheckCircle, Loader2, Zap, Sparkles,
  Paperclip, ExternalLink, Reply, Copy, Check, X, Plus,
  AlertTriangle, Mail, ArrowLeft, ChevronDown, ChevronUp,
  User, Phone, AtSign, Home as HomeIcon, UserPlus,
  Star, MoreVertical, Smile, Forward, Printer, ReplyAll,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ContractCardProps {
  email: EmailItem;
  onUpload: (emailId: string, attachmentId: string, filename: string) => void;
  allTags?: TagType[];
  onTagsChange?: (emailId: string, newTags: string[], newAiSuggestedTags?: string[]) => void;
  onContactLinked?: (emailId: string, contact: LinkedContact | null) => void;
  onTagsApplied?: (emailId: string, tags: string[], category: string | null) => void;
  onMarkReplied?: (emailId: string) => void;
  onSetRead?: (emailId: string, isRead: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
  emailIndex?: number;
  emailTotal?: number;
  onClose?: () => void;
  onSent?: (emailId: string) => void;
  onBodyLoaded?: (emailId: string, body: string, bodyHtml: string | undefined, hasAttachment: boolean, attachments: EmailItem["attachments"]) => void;
  ghlUserId?: string;
}

/** Extract the first actionable reply URL from email body text */
function extractReplyUrl(body: string): string | null {
  // Matches immocontact, centris, duproprio, flexmls, etc.
  const m = body.match(/https?:\/\/(?:www\.)?(?:immocontact|centris|duproprio|flexmls|rets|showingtime|css|showing|brookfield|royallepage|remax|viamedia|telmatik)[^\s<")\]]+/i)
    ?? body.match(/https?:\/\/[^\s<")\]]+(?:reply|confirm|accept|refuse|visite|showing|rdv|appointment)[^\s<")\]]*/i);
  if (m) return m[0].replace(/[.)]+$/, "");
  return null;
}

interface AppointmentInfo {
  title: string;
  startIso: string;
  endIso: string;
  address?: string;
  calUrl: string;
}

const FR_MONTHS_MAP: Record<string, string> = {
  janvier:"01", février:"02", mars:"03", avril:"04", mai:"05", juin:"06",
  juillet:"07", août:"08", septembre:"09", octobre:"10", novembre:"11", décembre:"12",
  jan:"01", fév:"02", mar:"03", avr:"04", juil:"07", août2:"08", sep:"09", oct:"10", nov:"11", déc:"12",
};

function parseTimeStr(t: string): string {
  // Normalize "10h00" or "10h" to "10:00"
  return t.replace(/h(\d{2})?$/, (_, m) => `:${m ?? "00"}`);
}

function parseDateStr(raw: string): string | null {
  const s = raw.trim();
  // ISO: 2026-03-27
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // French: "27 mars 2026" or "27 mars" (use current year)
  const frMatch = s.match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/);
  if (frMatch) {
    const [, d, mFr, y] = frMatch;
    const mNum = FR_MONTHS_MAP[mFr.toLowerCase()];
    if (!mNum) return null;
    const year = y ?? new Date().getFullYear().toString();
    return `${year}-${mNum}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Parse appointment info from email plain text body */
function extractAppointment(body: string, subject: string): AppointmentInfo | null {
  if (!body) return null;

  // Match "Date/heure:" or "Date :" patterns with various time formats
  const dateRe = /Date(?:\/heure)?\s*:\s*(?:\w+\.?,?\s*)?(\d{4}-\d{2}-\d{2}|\d{1,2}\s+\w+(?:\s+\d{4})?)\s*[,à]?\s*(\d{2}[h:]\d{0,2})\s*[-–à]\s*(\d{2}[h:]\d{0,2})/i;
  const addrRe = /Adresse\s*:\s*([^\n]+)/i;

  const dm = body.match(dateRe);
  if (!dm) return null;

  const dateStr = parseDateStr(dm[1]);
  if (!dateStr) return null;

  const startTime = parseTimeStr(dm[2]);
  const endTime   = parseTimeStr(dm[3]);
  const toGcal = (d: string, t: string) => `${d.replace(/-/g, "")}T${t.replace(":", "")}00`;

  const addrMatch = body.match(addrRe);
  const address = addrMatch?.[1]?.trim().replace(/^#_\d+,\s*/, "") ?? undefined;

  const title = subject || "Demande de visite";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toGcal(dateStr, startTime)}/${toGcal(dateStr, endTime)}`,
    ...(address ? { location: address } : {}),
    details: body.substring(0, 400),
  });

  return {
    title,
    startIso: `${dateStr}T${startTime}`,
    endIso:   `${dateStr}T${endTime}`,
    address,
    calUrl: `https://calendar.google.com/calendar/render?${params.toString()}`,
  };
}

export default function ContractCard({
  email, onUpload, allTags = [], onTagsChange, onContactLinked, onTagsApplied, onMarkReplied, onSetRead, onPrev, onNext, emailIndex, emailTotal, onClose, onSent, onBodyLoaded, ghlUserId,
}: ContractCardProps) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draft, setDraft] = useState("");
  const [tone, setTone] = useState("");
  const [draftError, setDraftError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagLoading, setTagLoading] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [showQuotedText, setShowQuotedText] = useState(false);
  const [leadCreating, setLeadCreating] = useState(false);
  const [leadCreated, setLeadCreated] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [bodyLoading, setBodyLoading] = useState(false);
  const [localBodyHtml, setLocalBodyHtml] = useState<string | undefined>(email.bodyHtml);
  const [localBody, setLocalBody] = useState<string>(email.body ?? "");
  const [localAttachments, setLocalAttachments] = useState(email.attachments);
  const [useBrand, setUseBrand] = useState(false);
  const [brandData, setBrandData] = useState<Record<string, string> | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const [showSendPreview, setShowSendPreview] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState("");
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [brandForm, setBrandForm] = useState<Record<string, string>>({});
  const [composeMode, setComposeMode] = useState<"reply" | "new" | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [visitConfirmed, setVisitConfirmed] = useState(false);
  const [previewAttId, setPreviewAttId] = useState<string | null>(null);

  const autoDraftedRef = useRef<string | null>(null);

  // Reset body state when navigating to a different email
  useEffect(() => {
    setLocalBodyHtml(email.bodyHtml);
    setLocalBody(email.body ?? "");
    setLocalAttachments(email.attachments);
    setShowCompose(false);
    setComposeMode(null);
    setDraft("");
    setVisitConfirmed(false);
    setSendState("idle");
    setShowQuotedText(false);
  }, [email.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-draft when email needs a reply and hasn't been drafted yet
  useEffect(() => {
    if (
      email.aiTags?.needsReply &&
      autoDraftedRef.current !== email.id &&
      !showCompose
    ) {
      autoDraftedRef.current = email.id;
      setShowCompose(true);
      setComposeMode("reply");
      setComposeTo(email.from.match(/<(.+?)>/)?.[1] ?? email.from);
      setDraft("");
      setTone("");
      setDraftError("");
      setSendState("idle");
      setIsDrafting(true);
      fetch("/api/emails/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: email.id,
          emailFrom: email.from,
          emailSubject: email.subject,
          emailBody: (email.body ?? email.snippet ?? "").substring(0, 3000),
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          setDraft(data.draft || "");
          setTone(data.tone || "");
        })
        .catch(() => setDraftError("Impossible de générer le brouillon."))
        .finally(() => setIsDrafting(false));
    }
  }, [email.id, email.aiTags?.needsReply]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const saved = localStorage.getItem("ola-theme");
    setIsDark(saved === "dark");
  }, []);

  // Keyboard navigation: J = next, K = prev (only when not typing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); onNext?.(); }
      if (e.key === "k" || e.key === "ArrowUp")   { e.preventDefault(); onPrev?.(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNext, onPrev]);

  // Lazy-load full body if not yet fetched
  const loadBody = useCallback(async () => {
    // Skip only if we have real HTML (not a plain-text <pre> fallback)
    if (localBodyHtml && !localBodyHtml.trimStart().startsWith("<pre")) return;
    setBodyLoading(true);
    try {
      const res = await fetch(`/api/emails/${email.id}/body`);
      if (!res.ok) return;
      const data = await res.json();
      setLocalBodyHtml(data.bodyHtml);
      setLocalBody(data.body ?? "");
      setLocalAttachments(data.attachments ?? []);
      onBodyLoaded?.(email.id, data.body ?? "", data.bodyHtml, data.hasAttachment ?? false, data.attachments ?? []);
    } catch { /* silent */ }
    finally { setBodyLoading(false); }
  }, [email.id, localBodyHtml, localBody, onBodyLoaded]);

  useEffect(() => {
    loadBody();
  }, [loadBody]);

  // Auto-classify email if not yet analyzed
  useEffect(() => {
    if (email.aiTags?.category) return; // already classified
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/emails/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailId: email.id }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.tags || data.category) {
            onTagsApplied?.(email.id, data.tags ?? [], data.category ?? null);
          }
        }
      } catch { /* silent */ }
    }, 800); // slight delay so body loads first
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.id]);

  // Fetch brandboard every time the checkbox is toggled on
  useEffect(() => {
    if (!useBrand) return;
    setBrandLoading(true);
    setBrandData(null);
    // Always call webhook first for fresh data (logo, colors)
    fetch("/api/brand")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error && !d.message && Object.values(d).some(Boolean)) {
          setBrandData(d);
          try { localStorage.setItem("ola-brand", JSON.stringify(d)); } catch { /* ok */ }
        } else {
          // Fallback to localStorage if webhook returns nothing useful
          try {
            const saved = localStorage.getItem("ola-brand");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed && Object.keys(parsed).length > 0) setBrandData(parsed);
            }
          } catch { /* silent */ }
        }
      })
      .catch(() => {
        // Fallback to localStorage on network error
        try {
          const saved = localStorage.getItem("ola-brand");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && Object.keys(parsed).length > 0) setBrandData(parsed);
          }
        } catch { /* silent */ }
      })
      .finally(() => setBrandLoading(false));
  }, [useBrand]);

  const handleSend = async () => {
    setSendState("sending");
    setSendError("");
    const finalBodyHtml = useBrand && brandData
      ? buildBrandedEmailHtml(draft, brandData)
      : null;
    const finalBodyText = useBrand && brandData
      ? buildBrandedEmail(draft, brandData)
      : draft;
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeMode === "new" ? composeTo : senderEmail,
          subject: composeMode === "new" ? draft.split("\n")[0] || "Sans objet" : `Re: ${email.subject}`,
          body: finalBodyText,
          bodyHtml: finalBodyHtml,
          threadId: composeMode === "new" ? undefined : email.threadId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur d'envoi");
      setSendState("sent");
      setShowSendPreview(false);
      setShowCompose(false);
      setDraft("");
      setTone("");
      onSent?.(email.id);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Erreur inconnue");
      setSendState("error");
    }
  };

  const handleUpload = async (attachmentId: string, filename: string) => {
    setUploadingId(attachmentId);
    await onUpload(email.id, attachmentId, filename);
    setUploadingId(null);
  };

  const handleDraft = async () => {
    setShowCompose(true);
    setIsDrafting(true);
    setDraft("");
    setTone("");
    setDraftError("");
    try {
      const res = await fetch("/api/emails/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: email.id,
          emailFrom: email.from,
          emailSubject: email.subject,
          emailBody: (email.body ?? email.snippet ?? "").substring(0, 3000),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setDraft(data.draft || "");
      setTone(data.tone || "");
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddTag = async (tagId: string) => {
    setTagLoading(tagId);
    setShowTagDropdown(false);
    try {
      const res = await fetch(`/api/emails/${email.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      if (res.ok) {
        const data = await res.json();
        onTagsChange?.(email.id, data.tags);
      }
    } catch { /* silent */ }
    finally { setTagLoading(null); }
  };

  const handleRemoveTag = async (tagId: string) => {
    setTagLoading(tagId);
    try {
      const res = await fetch(`/api/emails/${email.id}/tags?tagId=${encodeURIComponent(tagId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        onTagsChange?.(email.id, data.tags, data.aiTags?.suggestedTags);
      }
    } catch { /* silent */ }
    finally { setTagLoading(null); }
  };

  const handleCreateLeadContact = async () => {
    const ec = email.analysis?.extractedContact;
    if (!ec) return;
    setLeadCreating(true);
    setLeadError("");
    try {
      const res = await fetch("/api/ghl/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: ec.name?.split(" ")[0] ?? "",
          lastName: ec.name?.split(" ").slice(1).join(" ") ?? "",
          email: ec.email,
          phone: ec.phone,
          address1: ec.propertyAddress,
          tags: ["lead", "client"],
          source: "OLA - Demande d'informations",
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Erreur création contact");
      }
      const data = await res.json();
      setLeadCreated(true);
      onContactLinked?.(email.id, { id: data.contact?.id ?? "", name: ec.name ?? "Nouveau client", email: ec.email, phone: ec.phone });
    } catch (err) {
      setLeadError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLeadCreating(false);
    }
  };

  let formattedDate = "";
  try {
    formattedDate = format(new Date(email.date), "d MMM yyyy, HH:mm", { locale: fr });
  } catch { formattedDate = email.date; }

  const { ghlUpload, aiTags } = email;

  // Merge manual + AI suggested tags into a single deduplicated list
  const manualTagIds = email.tags ?? [];
  const aiSuggestedTagIds = aiTags?.suggestedTags ?? [];
  const allDisplayTagIds = Array.from(new Set([...manualTagIds, ...aiSuggestedTagIds]));
  const allDisplayTagObjects = allDisplayTagIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter(Boolean) as TagType[];

  // Tags available to add (not in display list)
  const availableToAdd = allTags.filter((t) => !allDisplayTagIds.includes(t.id));

  // Computed sender info
  const senderName = email.from.replace(/<[^>]+>/g, "").replace(/"/g, "").trim() || email.from;
  const senderEmail = email.from.match(/<([^>]+)>/)?.[1] ?? email.from;

  // Detect actionable reply URL (immocontact / showing requests)
  const replyUrl = extractReplyUrl(localBody || "");
  // Detect appointment info
  const appointmentInfo = extractAppointment(localBody || "", email.subject);

  return (
    <div className="h-full flex overflow-hidden bg-white dark:bg-[#202124]">
    {/* ── Main email column ── */}
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">

      {/* ── Gmail-style subject header ── */}
      <div className="flex items-start gap-1 px-4 pt-5 pb-2 flex-shrink-0">
        {/* Back + prev/next navigation */}
        <div className="flex items-center gap-0.5 mt-0.5 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6]"
            title="Retour à la liste"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onPrev}
            disabled={!onPrev}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6] disabled:opacity-30 disabled:cursor-default"
            title="Email précédent"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onNext}
            disabled={!onNext}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6] disabled:opacity-30 disabled:cursor-default"
            title="Email suivant"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          {emailTotal !== undefined && (
            <span className="text-[11px] text-[#9aa0a6] ml-1 tabular-nums">
              {(emailIndex ?? 0) + 1}/{emailTotal}
            </span>
          )}
        </div>

        {/* Subject + label chips */}
        <div className="flex-1 min-w-0 flex items-start flex-wrap gap-2 pt-0.5">
          <h1 className="text-[22px] font-normal text-[#202124] dark:text-[#e8eaed] leading-tight max-w-full">
            {email.subject}
          </h1>
          {/* Unified tag chips — one list, all removable */}
          {allDisplayTagObjects.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-1.5"
              style={{
                backgroundColor: isDark ? tag.darkColor : tag.color,
                color: isDark ? tag.darkTextColor : tag.textColor,
              }}
            >
              {tag.name}
              {tagLoading === tag.id
                ? <Loader2 className="w-2.5 h-2.5 animate-spin ml-0.5" />
                : (
                  <button
                    onClick={() => handleRemoveTag(tag.id)}
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                    title="Retirer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
            </span>
          ))}
          {/* Urgent badge */}
          {aiTags?.urgency === "urgent" && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#fce8e6] dark:bg-[#3b1f1e] text-[#c5221f] dark:text-[#f28b82] font-medium flex-shrink-0 mt-1.5">
              <AlertTriangle className="w-3 h-3" /> Urgent
            </span>
          )}
        </div>

        {/* Top-right: print + new window */}
        <div className="flex items-center gap-0.5 flex-shrink-0 mt-1">
          <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6]" title="Imprimer">
            <Printer className="w-4 h-4" />
          </button>
          <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6]" title="Nouvelle fenêtre">
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Gmail-style sender card ── */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="flex items-start gap-3">
          {/* Sender details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              {/* Name + "à moi" */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className="text-[14px] font-semibold text-[#202124] dark:text-[#e8eaed] leading-snug truncate max-w-[260px]">
                    {senderName}
                  </span>
                  {/* Add tag button inline */}
                  <div className="relative">
                    <button
                      onClick={() => setShowTagDropdown((v) => !v)}
                      className="inline-flex items-center gap-0.5 text-[11px] text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] px-1.5 py-0.5 rounded transition-colors"
                      title="Étiqueter"
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    {showTagDropdown && (
                      <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-[#2d2e30] border border-[#e0e0e0] dark:border-[#3c4043] rounded-xl shadow-lg min-w-[200px] max-h-[280px] overflow-y-auto">
                        <div className="p-1">
                          {availableToAdd.length === 0 ? (
                            <p className="px-3 py-2 text-[12px] text-[#9aa0a6]">Toutes les étiquettes appliquées</p>
                          ) : (
                            availableToAdd.map((tag) => (
                              <button
                                key={tag.id}
                                onClick={() => handleAddTag(tag.id)}
                                disabled={tagLoading === tag.id}
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] rounded-lg transition-colors text-left"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: isDark ? tag.darkColor : tag.color, border: `1px solid ${isDark ? tag.darkTextColor : tag.textColor}` }}
                                />
                                <span className="text-[13px] text-[#202124] dark:text-[#e8eaed] truncate">{tag.name}</span>
                                {tag.group !== "custom" && (
                                  <span className="text-[10px] text-[#9aa0a6] flex-shrink-0 capitalize">{tag.group}</span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Sender email (small, muted) */}
                <p className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] mt-0.5 truncate">
                  {senderEmail}
                </p>
              </div>

              {/* Right: timestamp + action icons */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <span className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] mr-1 whitespace-nowrap">{formattedDate}</span>
                <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6]" title="Suivre">
                  <Star className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDraft}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6]"
                  title="Répondre"
                >
                  <Reply className="w-4 h-4" />
                </button>
                {email.aiTags?.needsReply && (
                  <button
                    onClick={() => { onMarkReplied?.(email.id); }}
                    className="ml-1 flex items-center gap-1 text-[11px] text-[#9aa0a6] hover:text-[#5f6368] dark:hover:text-[#e8eaed] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] px-2 py-1 rounded-full transition-colors"
                    title="Pas de réponse nécessaire — enseigne l'IA"
                  >
                    <X className="w-3 h-3" />
                    Pas de réponse
                  </button>
                )}
                <button
                  onClick={() => onSetRead?.(email.id, email.isRead ? false : true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6]"
                  title={email.isRead ? "Marquer comme non lu" : "Marquer comme lu"}
                >
                  <Mail className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors text-[#5f6368] dark:text-[#9aa0a6]" title="Plus d'options">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick action icon bar ── */}
      {!showCompose && (
        <div className="quick-action-bar">
          <button
            className="quick-action-btn"
            title="Scanner et analyser l'email"
            onClick={async () => {
              try {
                const res = await fetch(`/api/emails/analyze?id=${email.id}`, { method: "POST" });
                if (res.ok) {
                  const data = await res.json();
                  if (data.aiTags && onTagsApplied) onTagsApplied(email.id, data.aiTags.suggestedTags ?? [], data.aiTags.category ?? null);
                }
              } catch { /* silent */ }
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Scanner</span>
          </button>
          <button
            className="quick-action-btn"
            title="Répondre avec l'IA"
            onClick={handleDraft}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Répondre IA</span>
          </button>
          {email.linkedContact ? (
            <button
              className="quick-action-btn quick-action-btn--linked"
              title={`Lié à ${email.linkedContact.name}`}
              onClick={() => window.open(`https://app.leadconnectorhq.com/contacts/${email.linkedContact!.id}`, "_blank")}
            >
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[100px]">{email.linkedContact.name}</span>
            </button>
          ) : (
            <button
              className="quick-action-btn"
              title="Lier un contact OLA"
              onClick={() => { /* TODO: contact search */ }}
            >
              <User className="w-3.5 h-3.5" />
              <span>Lier contact</span>
            </button>
          )}
          <button
            className="quick-action-btn"
            title="Marquer comme lu / non lu"
            onClick={() => onSetRead?.(email.id, !email.isRead)}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>{email.isRead ? "Non lu" : "Lu"}</span>
          </button>
        </div>
      )}

      {/* ── Body or Compose (full-height) ── */}
      {showCompose ? (
        /* ── Full-height compose view ── */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Compose header */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-[#e0e0e0] dark:border-[#3c4043]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowCompose(false); setComposeMode(null); setDraft(""); setTone(""); }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
              >
                <X className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6]" />
              </button>
              <span className="text-[15px] font-medium text-[#202124] dark:text-[#e8eaed]">
                {composeMode === "new" ? "Nouveau message" : `Répondre à ${senderName}`}
              </span>
            </div>
            {!isDrafting && (
              <button
                onClick={handleDraft}
                className="flex items-center gap-1.5 text-[13px] text-[#1a73e8] dark:text-[#a8c7fa] hover:bg-[#e8f0fe] dark:hover:bg-[#1a2744] px-3 py-1.5 rounded-full transition-colors font-medium"
              >
                <Zap className="w-3.5 h-3.5" />{draft ? "Régénérer" : "Générer avec l'IA"}
              </button>
            )}
          </div>

          {/* Compose fields: À + Objet */}
          <div className="flex-shrink-0 border-b border-[#e0e0e0] dark:border-[#3c4043]">
            <div className="flex items-center border-b border-[#e0e0e0] dark:border-[#3c4043] px-6">
              <span className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] w-14 flex-shrink-0">À</span>
              {composeMode === "new" ? (
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="destinataire@exemple.com"
                  className="flex-1 py-3 text-[14px] bg-transparent text-[#202124] dark:text-[#e8eaed] outline-none placeholder-[#9aa0a6]"
                />
              ) : (
                <span className="flex-1 py-3 text-[14px] text-[#202124] dark:text-[#e8eaed] truncate">
                  {email.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim()}
                </span>
              )}
            </div>
            <div className="flex items-center px-6">
              <span className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] w-14 flex-shrink-0">Objet</span>
              <span className="flex-1 py-3 text-[14px] text-[#202124] dark:text-[#e8eaed] truncate">
                {composeMode === "new" ? "Nouveau message" : `Re: ${email.subject}`}
              </span>
              {tone && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#e8f0fe] dark:bg-[#1a2744] text-[#1a73e8] dark:text-[#a8c7fa] flex-shrink-0 mr-4">
                  Ton : {tone}
                </span>
              )}
            </div>
          </div>

          {/* Compose body: textarea or loading */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isDrafting ? (
              <div className="flex items-center gap-3 py-12 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#1a73e8] dark:text-[#a8c7fa]" />
                <span className="text-[14px] text-[#5f6368] dark:text-[#9aa0a6]">Analyse du ton et génération de la réponse…</span>
              </div>
            ) : draftError ? (
              <p className="text-[14px] text-[#ea4335] py-4">{draftError}</p>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full min-h-[300px] text-[14px] text-[#202124] dark:text-[#e8eaed] bg-transparent resize-none outline-none placeholder-[#9aa0a6] leading-relaxed"
                placeholder="Réponse générée par l'IA..."
              />
            )}

            {/* Brand config form */}
            {showBrandForm && (
              <div className="px-4 py-3 bg-[#f8f9fa] dark:bg-[#2d2e30] border border-[#e0e0e0] dark:border-[#3c4043] rounded-xl mt-4 space-y-2">
                <p className="text-[11px] font-medium text-[#5f6368] dark:text-[#9aa0a6] uppercase tracking-wider mb-2">Informations de marque</p>
                {[
                  { key: "name",        label: "Nom complet" },
                  { key: "title",       label: "Titre (ex: Courtier immobilier)" },
                  { key: "brokerage",   label: "Agence / Courtage" },
                  { key: "phone",       label: "Téléphone" },
                  { key: "email",       label: "Email" },
                  { key: "website",     label: "Site web" },
                  { key: "logo",        label: "URL du logo" },
                  { key: "primaryColor",label: "Couleur principale (ex: #1a1a2e)" },
                  { key: "accentColor", label: "Couleur accent (ex: #c9a84c)" },
                  { key: "tagline",     label: "Slogan" },
                ].map(({ key, label }) => (
                  <input
                    key={key}
                    type="text"
                    placeholder={label}
                    value={brandForm[key] ?? ""}
                    onChange={(e) => setBrandForm((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-[#dadce0] dark:border-[#3c4043] bg-white dark:bg-[#202124] text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] transition-colors"
                  />
                ))}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      const filtered = Object.fromEntries(Object.entries(brandForm).filter(([, v]) => v));
                      localStorage.setItem("ola-brand", JSON.stringify(filtered));
                      setBrandData(filtered);
                      setShowBrandForm(false);
                    }}
                    className="flex-1 text-[12px] font-medium bg-[#1a73e8] text-white py-1.5 rounded-lg hover:bg-[#1557b0] transition-colors"
                  >
                    Enregistrer
                  </button>
                  <button
                    onClick={() => setShowBrandForm(false)}
                    className="text-[12px] text-[#5f6368] px-3 py-1.5 rounded-lg hover:bg-[#e8eaed] dark:hover:bg-[#3c4043] transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Compose bottom bar */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-[#e0e0e0] dark:border-[#3c4043] bg-white dark:bg-[#202124]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useBrand}
                onChange={(e) => setUseBrand(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#1a73e8]"
              />
              <span className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">Ma marque</span>
              {brandLoading && <Loader2 className="w-3 h-3 animate-spin text-[#1a73e8]" />}
              {useBrand && brandData?.name && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#e6f4ea] dark:bg-[#1a3a24] text-[#137333] dark:text-[#81c995] font-medium">
                  {brandData.name}
                </span>
              )}
              {useBrand && !brandLoading && !brandData && (
                <button
                  onClick={() => {
                    const saved = localStorage.getItem("ola-brand");
                    setBrandForm(saved ? JSON.parse(saved) : {});
                    setShowBrandForm(true);
                  }}
                  className="text-[11px] text-[#ea4335] underline"
                >
                  Configurer ma marque
                </button>
              )}
              {useBrand && brandData && (
                <button
                  onClick={() => {
                    setBrandForm({ ...brandData });
                    setShowBrandForm(true);
                  }}
                  className="text-[11px] text-[#1a73e8] dark:text-[#a8c7fa] underline"
                >
                  Modifier
                </button>
              )}
            </label>
            <div className="flex items-center gap-2">
              {sendState === "error" && (
                <div className="flex items-center gap-1.5 text-[12px] text-[#c5221f] dark:text-[#f28b82]">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {sendError}
                </div>
              )}
              {sendState === "sent" && (
                <div className="flex items-center gap-1.5 text-[12px] text-[#137333] dark:text-[#81c995]">
                  <CheckCircle className="w-3.5 h-3.5" /> Envoyé
                </div>
              )}
              <button
                onClick={() => {
                  const textToCopy = useBrand && brandData
                    ? buildBrandedEmail(draft, brandData)
                    : draft;
                  navigator.clipboard.writeText(textToCopy);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                disabled={isDrafting || !draft}
                className="flex items-center gap-1.5 text-[13px] text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] px-3 py-2 rounded-full hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] transition-colors disabled:opacity-40"
              >
                {copied ? <Check className="w-4 h-4 text-[#137333]" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copié" : "Copier"}
              </button>
              <button
                disabled={isDrafting || !draft || sendState === "sending"}
                className="flex items-center gap-1.5 bg-[#1a73e8] hover:bg-[#1557b0] dark:bg-[#a8c7fa] dark:hover:bg-[#c2d9ff] disabled:opacity-40 text-white dark:text-[#062e6f] text-[13px] font-medium px-5 py-2 rounded-full transition-colors shadow-sm"
                onClick={() => { setSendState("idle"); setSendError(""); setShowSendPreview(true); }}
              >
                <Mail className="w-3.5 h-3.5" />
                Envoyer
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Normal email body scroll area ── */
        <div className="flex-1 overflow-y-auto pl-[68px] pr-8 pb-6" onClick={() => setShowTagDropdown(false)}>

        <div className="border-t border-[#e0e0e0] dark:border-[#3c4043] mb-5" />

        {/* ── Lead / Demande d'informations card ── */}
        {email.analysis?.extractedContact?.isDemandeInfo && (
          <div className="mb-5 rounded-2xl border border-[#a8c7fa] dark:border-[#1a4a8a] bg-[#e8f0fe] dark:bg-[#0d2247] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#d2e3fc] dark:bg-[#1a2e5a] border-b border-[#a8c7fa] dark:border-[#1a4a8a]">
              <UserPlus className="w-4 h-4 text-[#1a73e8] dark:text-[#a8c7fa]" />
              <span className="text-[13px] font-semibold text-[#1a73e8] dark:text-[#a8c7fa]">Demande d&apos;informations — Nouveau lead</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {email.analysis.extractedContact.name && (
                <div className="flex items-center gap-2.5">
                  <User className="w-3.5 h-3.5 text-[#1a73e8] dark:text-[#a8c7fa] flex-shrink-0" />
                  <span className="text-[13px] font-medium text-[#202124] dark:text-[#e8eaed]">{email.analysis.extractedContact.name}</span>
                </div>
              )}
              {email.analysis.extractedContact.email && (
                <div className="flex items-center gap-2.5">
                  <AtSign className="w-3.5 h-3.5 text-[#1a73e8] dark:text-[#a8c7fa] flex-shrink-0" />
                  <a href={`mailto:${email.analysis.extractedContact.email}`}
                    className="text-[13px] text-[#1a73e8] dark:text-[#a8c7fa] hover:underline">
                    {email.analysis.extractedContact.email}
                  </a>
                </div>
              )}
              {email.analysis.extractedContact.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="w-3.5 h-3.5 text-[#1a73e8] dark:text-[#a8c7fa] flex-shrink-0" />
                  <a href={`tel:${email.analysis.extractedContact.phone}`}
                    className="text-[13px] text-[#1a73e8] dark:text-[#a8c7fa] hover:underline">
                    {email.analysis.extractedContact.phone}
                  </a>
                </div>
              )}
              {email.analysis.extractedContact.propertyAddress && (
                <div className="flex items-center gap-2.5">
                  <HomeIcon className="w-3.5 h-3.5 text-[#1a73e8] dark:text-[#a8c7fa] flex-shrink-0" />
                  <span className="text-[13px] text-[#202124] dark:text-[#e8eaed]">{email.analysis.extractedContact.propertyAddress}</span>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-[#a8c7fa] dark:border-[#1a4a8a] flex items-center gap-3">
              {leadCreated ? (
                <div className="flex items-center gap-1.5 text-[13px] text-[#137333] dark:text-[#81c995] font-medium">
                  <CheckCircle className="w-4 h-4" /> Contact créé dans OLA
                </div>
              ) : (
                <button
                  onClick={handleCreateLeadContact}
                  disabled={leadCreating}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium bg-[#1a73e8] hover:bg-[#1557b0] dark:bg-[#a8c7fa] dark:hover:bg-[#c2d9ff] disabled:opacity-40 text-white dark:text-[#062e6f] px-4 py-2 rounded-full transition-colors"
                >
                  {leadCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {leadCreating ? "Création..." : "Créer contact OLA"}
                </button>
              )}
              {leadError && (
                <span className="text-[12px] text-[#ea4335]">{leadError}</span>
              )}
            </div>
          </div>
        )}


        {/* ── Email body viewer ── */}
        {bodyLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-[#1a73e8] dark:text-[#a8c7fa]" />
            <span className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">Chargement de l&apos;email…</span>
          </div>
        ) : localBodyHtml ? (
          <EmailBodyHtml html={localBodyHtml} isDark={isDark} showQuoted={showQuotedText} onToggleQuoted={() => setShowQuotedText(v => !v)} />
        ) : localBody ? (
          <EmailBodyText body={localBody} isDark={isDark} />
        ) : email.snippet ? (
          <p className="text-[14px] text-[#202124] dark:text-[#c4c7c5] leading-relaxed mb-6 italic opacity-70">{email.snippet}</p>
        ) : null}

        {/* ── Attachments ── */}
        {localAttachments.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 mb-2">
              <Paperclip className="w-3.5 h-3.5 text-[#5f6368] dark:text-[#9aa0a6]" />
              <span className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">
                {localAttachments.length} pièce{localAttachments.length > 1 ? "s" : ""} jointe{localAttachments.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-1.5">
              {((() => {
                const filtered = localAttachments.filter((a) =>
                  a.mimeType === "application/pdf" ||
                  a.filename.toLowerCase().endsWith(".pdf") ||
                  a.filename.toLowerCase().endsWith(".docx") ||
                  a.filename.toLowerCase().includes("contrat") ||
                  a.filename.toLowerCase().includes("bail")
                );
                return filtered.length > 0 ? filtered : localAttachments;
              })()).map((att) => {
                const isUploading = uploadingId === att.attachmentId;
                const isUploaded = ghlUpload?.uploaded;
                const canUpload = email.analysis?.isContract && !isUploaded;
                const sizeKB = Math.round(att.size / 1024);

                const isPdf = att.mimeType === "application/pdf" || att.filename.toLowerCase().endsWith(".pdf");
                const isImage = att.mimeType.startsWith("image/");
                const canPreview = isPdf || isImage;
                const isExpanded = previewAttId === att.attachmentId;
                const previewUrl = `/api/emails/${email.id}/attachment/${att.attachmentId}?mime=${encodeURIComponent(att.mimeType)}`;

                return (
                  <div key={att.attachmentId} className="border border-[#e0e0e0] dark:border-[#3c4043] rounded-xl overflow-hidden">
                    <div
                      className={`flex items-center gap-3 p-3 transition-colors ${canPreview ? "cursor-pointer hover:bg-[#f6f8fc] dark:hover:bg-[#2d2e30]" : ""}`}
                      onClick={() => canPreview && setPreviewAttId(isExpanded ? null : att.attachmentId)}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isPdf ? "bg-[#ea4335]" : isImage ? "bg-[#34a853]" : "bg-[#5f6368]"}`}>
                        <Paperclip className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#202124] dark:text-[#e8eaed] truncate font-medium">{att.filename}</p>
                        <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                          {sizeKB > 0 ? `${sizeKB} Ko` : att.mimeType}
                          {canPreview && <span className="ml-1 opacity-60">· {isExpanded ? "Fermer" : "Aperçu"}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isUploaded ? (
                          <div className="flex items-center gap-1 text-[12px] text-[#137333] dark:text-[#81c995]">
                            <CheckCircle className="w-3.5 h-3.5" /> Uploadé
                          </div>
                        ) : canUpload ? (
                          <button
                            onClick={() => handleUpload(att.attachmentId, att.filename)}
                            disabled={isUploading || !!uploadingId}
                            className="flex items-center gap-1.5 text-[12px] font-medium text-[#1a73e8] dark:text-[#a8c7fa] hover:bg-[#e8f0fe] dark:hover:bg-[#1a2744] px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 border border-[#1a73e8] dark:border-[#a8c7fa]"
                          >
                            {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            {isUploading ? "Envoi..." : "Envoyer vers OLA"}
                          </button>
                        ) : !email.analysis ? (
                          <span className="text-[11px] text-[#9aa0a6]">Analyser d&apos;abord</span>
                        ) : null}
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 flex items-center justify-center text-[#5f6368] hover:text-[#1a73e8] hover:bg-[#e8f0fe] dark:hover:bg-[#1a2744] rounded-full transition-colors"
                          title="Ouvrir dans un nouvel onglet"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Inline preview */}
                    {isExpanded && (
                      <div className="border-t border-[#e0e0e0] dark:border-[#3c4043] bg-[#f6f8fc] dark:bg-[#2d2e30]">
                        {isPdf ? (
                          <iframe
                            src={previewUrl}
                            className="w-full"
                            style={{ height: 500 }}
                            title={att.filename}
                          />
                        ) : isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewUrl}
                            alt={att.filename}
                            className="max-w-full max-h-[500px] mx-auto block p-3 object-contain"
                          />
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        </div>
      )}

      {/* ── Send Preview Modal — outside ternary so always reachable ── */}
      {showSendPreview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white dark:bg-[#292a2d] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg sm:max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e0e0e0] dark:border-[#3c4043]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1a73e8] dark:bg-[#a8c7fa] flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-white dark:text-[#062e6f]" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#202124] dark:text-[#e8eaed] leading-tight">
                    {composeMode === "new" ? composeTo : (email.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || senderEmail)}
                  </p>
                  <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                    {composeMode === "new" ? "Nouveau message" : `Re: ${email.subject}`}
                    {tone && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[#e8f0fe] dark:bg-[#1a2744] text-[#1a73e8] dark:text-[#a8c7fa]">{tone}</span>}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowSendPreview(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body preview */}
            <div className="flex-1 overflow-y-auto">
              {useBrand && brandData ? (
                <iframe
                  srcDoc={buildBrandedEmailHtml(draft, brandData)}
                  sandbox="allow-same-origin allow-scripts allow-popups"
                  className="w-full border-0"
                  style={{ minHeight: "360px" }}
                  onLoad={(e) => {
                    const f = e.currentTarget;
                    try { f.style.height = f.contentDocument?.body?.scrollHeight + "px"; } catch { /* ok */ }
                  }}
                />
              ) : (
                <div className="px-5 py-4">
                  <p className="text-[14px] text-[#202124] dark:text-[#e8eaed] whitespace-pre-wrap leading-[1.8]">
                    {draft}
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {sendState === "error" && (
              <div className="px-5 py-2 bg-[#fce8e6] dark:bg-[#3b1a1a] text-[#c5221f] dark:text-[#f28b82] text-[12px] flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {sendError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-[#e0e0e0] dark:border-[#3c4043]">
              <button
                onClick={() => setShowSendPreview(false)}
                className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] px-4 py-2 rounded-full hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] transition-colors"
              >
                ← Modifier
              </button>
              <button
                onClick={handleSend}
                disabled={sendState === "sending"}
                className="flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] dark:bg-[#a8c7fa] dark:hover:bg-[#c2d9ff] disabled:opacity-60 text-white dark:text-[#062e6f] text-[13px] font-medium px-6 py-2.5 rounded-full transition-colors shadow-sm"
              >
                {sendState === "sending"
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Envoi...</>
                  : <><Mail className="w-3.5 h-3.5" /> Confirmer l&apos;envoi</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom action bar — hidden when composing ── */}
      {!showCompose && (
        <div className="pl-[68px] pr-8 py-2 border-t border-[#e0e0e0] dark:border-[#3c4043] flex-shrink-0 bg-white dark:bg-[#202124] flex items-center gap-1">
          <button
            onClick={() => { setShowCompose(true); setComposeMode("reply"); setComposeTo(senderEmail); setDraft(""); setTone(""); setDraftError(""); setSendState("idle"); handleDraft(); }}
            title="Répondre avec l'IA"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1a73e8] hover:bg-[#1557b0] dark:bg-[#a8c7fa] dark:hover:bg-[#c2d9ff] text-white dark:text-[#062e6f] transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setShowCompose(true); setComposeMode("reply"); setComposeTo(senderEmail); setDraft(""); setTone(""); setDraftError(""); setSendState("idle"); }}
            title="Répondre"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] text-[#5f6368] dark:text-[#9aa0a6]"
          >
            <Reply className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowCompose(true); setComposeMode("reply"); setComposeTo(senderEmail); setDraft(`---------- Message transféré ----------\nDe : ${email.from}\nObjet : ${email.subject}\n\n${localBody}`); setTone(""); setDraftError(""); setSendState("idle"); }}
            title="Transférer"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] text-[#5f6368] dark:text-[#9aa0a6] transition-colors"
          >
            <Forward className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowCompose(true); setComposeMode("new"); setComposeTo(""); setDraft(""); setTone(""); setDraftError(""); setSendState("idle"); }}
            title="Nouvel email"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] text-[#5f6368] dark:text-[#9aa0a6] transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          {aiTags?.needsReply && !replyUrl && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#fce8e6] dark:bg-[#3b1a1a] text-[#c5221f] dark:text-[#f28b82]">
              Action requise
            </span>
          )}
        </div>
      )}
    </div>

    </div>
  );
}

// ── Brand helper ─────────────────────────────────────────────────────────────

export function buildBrandedEmailHtml(draft: string, brand: Record<string, string>): string {
  const primary  = brand.primaryColor || "#05575B";
  const accent   = brand.accentColor  || "#66A5AE";
  const font     = brand.primaryFont  ? `'${brand.primaryFont}', ` : "";
  const fontStack = `${font}-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
  const fontImport = brand.primaryFont
    ? `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.primaryFont)}:wght@400;500;600&display=swap" rel="stylesheet">`
    : "";

  const paragraphs = draft.split(/\n\n+/).filter(Boolean);
  const leadPara   = paragraphs[0] || "";
  const restParas  = paragraphs.slice(1);

  const leadHtml = `<p style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-style:italic;color:#1a1a1a;line-height:1.75;">${leadPara.replace(/\n/g, "<br>")}</p>`;
  const restHtml = restParas
    .map((p) => `<p style="margin:0 0 20px;font-family:${fontStack};font-size:15px;color:#3a3a3a;line-height:1.8;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  const contactParts = [
    brand.phone   ? `<a href="tel:${brand.phone}" style="color:${accent};text-decoration:none;">${brand.phone}</a>` : "",
    brand.email   ? `<a href="mailto:${brand.email}" style="color:${accent};text-decoration:none;">${brand.email}</a>` : "",
    brand.website ? `<a href="${brand.website}" style="color:${accent};text-decoration:none;">${brand.website.replace(/^https?:\/\//, "")}</a>` : "",
  ].filter(Boolean).join("<span style='color:#c0c0c0;margin:0 8px;'>·</span>");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${fontImport}
</head>
<body style="margin:0;padding:0;background:#f2f2ef;font-family:${fontStack};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2ef;padding:48px 20px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;">

  <!-- TOP ACCENT BAR -->
  <tr><td style="height:3px;background:${primary};line-height:3px;font-size:0;"></td></tr>

  <!-- HEADER: tiny logo top-right -->
  <tr>
    <td style="padding:20px 28px 20px;border-bottom:1px solid #ebebeb;text-align:right;">
      ${brand.logo
        ? `<img src="${brand.logo}" alt="${brand.name || ""}" style="height:16px;width:auto;display:inline-block;opacity:0.7;" />`
        : brand.name
          ? `<span style="font-family:${fontStack};font-size:11px;color:#bbb;letter-spacing:0.5px;">${brand.name}</span>`
          : ""}
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:40px 44px 0;">
      ${leadHtml}
      ${restParas.length > 0 ? `
      <div style="width:32px;height:1px;background:#ddd;margin:0 0 28px;"></div>
      ${restHtml}` : ""}
    </td>
  </tr>

  <!-- SIGNATURE -->
  <tr>
    <td style="padding:28px 44px 40px;border-top:1px solid #ebebeb;">
      ${[brand.title, brand.brokerage].filter(Boolean).join(" · ")
        ? `<div style="font-family:${fontStack};font-size:11px;color:#aaa;letter-spacing:0.2px;margin-bottom:6px;">${[brand.title, brand.brokerage].filter(Boolean).join(" · ")}</div>`
        : ""}
      ${contactParts ? `<div style="font-family:${fontStack};font-size:12px;">${contactParts}</div>` : ""}
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildBrandedEmail(draft: string, brand: Record<string, string>): string {
  const lines: string[] = [draft, "", "--"];
  if (brand.name)     lines.push(brand.name);
  if (brand.title)    lines.push(brand.title);
  if (brand.brokerage)lines.push(brand.brokerage);
  if (brand.phone)    lines.push(`Tél : ${brand.phone}`);
  if (brand.email)    lines.push(brand.email);
  if (brand.website)  lines.push(brand.website);
  if (brand.address)  lines.push(brand.address);
  return lines.join("\n");
}

function InfoRow({ icon, label, value, mono = false }: {
  icon: React.ReactNode; label: string; value: string; mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[#5f6368] dark:text-[#9aa0a6] mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">{label} · </span>
        <span className={`text-[13px] text-[#202124] dark:text-[#e8eaed] ${mono ? "font-mono text-[12px]" : "font-medium"}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Email body sub-components ─────────────────────────────────────────────────

const buildEmailStyles = (dark: boolean) => `<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  html, body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 15px;
    line-height: 1.85;
    color: ${dark ? "#e8eaed" : "#202124"};
    background: ${dark ? "#202124" : "#ffffff"};
    word-break: break-word;
    overflow-wrap: anywhere;
    overflow-x: hidden;
  }
  body { padding: 16px 20px 24px; }

  /* Links — always clickable */
  a { color: ${dark ? "#a8c7fa" : "#1a73e8"}; text-decoration: underline; cursor: pointer; pointer-events: auto; }
  a[href^="tel:"] { color: ${dark ? "#a8c7fa" : "#1a73e8"}; }
  a[href^="mailto:"] { color: ${dark ? "#a8c7fa" : "#1a73e8"}; }
  a:hover { opacity: 0.8; }

  /* Images */
  img { max-width: 100% !important; height: auto; display: inline-block; }
  img[width="1"], img[height="1"] { display: none !important; }

  /* Tables — preserve email layout, just prevent overflow */
  table { border-collapse: collapse; max-width: 100% !important; }
  td, th { word-break: break-word; }

  /* Fluid containers */
  [style*="width:600px"], [style*="width: 600px"],
  [style*="width:650px"], [style*="width: 650px"],
  [style*="width:700px"], [style*="width: 700px"] { width: 100% !important; max-width: 100% !important; }

  /* Typography */
  p { margin: 0 0 14px; }
  p:last-child { margin-bottom: 0; }
  h1 { font-size: 20px; font-weight: 600; margin: 16px 0 8px; }
  h2 { font-size: 17px; font-weight: 600; margin: 14px 0 6px; }
  h3, h4, h5 { font-size: 14px; font-weight: 600; margin: 12px 0 4px; }
  ul, ol { padding-left: 22px; margin: 6px 0; }
  li { margin-bottom: 3px; }

  /* Blockquote */
  blockquote {
    margin: 10px 0; padding: 8px 14px;
    border-left: 3px solid ${dark ? "#5f6368" : "#dadce0"};
    color: ${dark ? "#9aa0a6" : "#5f6368"};
    font-size: 13px;
  }

  /* Code */
  pre, code { font-family: 'Courier New', monospace; font-size: 12px; background: ${dark ? "#303134" : "#f1f3f4"}; border-radius: 4px; padding: 2px 6px; }
  pre { padding: 12px 16px; overflow-x: auto; white-space: pre-wrap; border-radius: 8px; }

  hr { border: none; border-top: 1px solid ${dark ? "#3c4043" : "#e0e0e0"}; margin: 14px 0; }

  /* Gmail quoted */
  .gmail_quote, .gmail_extra { color: ${dark ? "#9aa0a6" : "#5f6368"}; font-size: 13px; }
  .ola-quoted-hidden { display: none !important; }

  ${dark ? `
  [style*="background-color:#ffffff"],[style*="background-color: #ffffff"],
  [style*="background-color:#FFFFFF"],[bgcolor="ffffff"],[bgcolor="#ffffff"] {
    background-color: #202124 !important; background: #202124 !important;
  }
  [style*="color:#000000"],[style*="color:#333"],[style*="color:#222"] { color: #e8eaed !important; }
  ` : ""}
</style>`;

function EmailBodyHtml({
  html, isDark, showQuoted, onToggleQuoted,
}: {
  html: string;
  isDark: boolean;
  showQuoted: boolean;
  onToggleQuoted: () => void;
}) {
  const [height, setHeight] = useState(300);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Detect quoted text
  const hasQuote = /<div class="gmail_quote|<blockquote|<div class="gmail_extra/i.test(html);

  // Inject styles and optionally hide quoted content
  const processedHtml = showQuoted
    ? html
    : html
        .replace(/<div class="gmail_quote([^"]*)"([^>]*)>/gi, '<div class="gmail_quote$1 ola-quoted-hidden"$2>')
        .replace(/<div class="gmail_extra([^"]*)"([^>]*)>/gi, '<div class="gmail_extra$1 ola-quoted-hidden"$2>');

  const srcdoc = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">${buildEmailStyles(isDark)}</head><body>${processedHtml}</body></html>`;

  const resize = () => {
    try {
      const body = iframeRef.current?.contentDocument?.body;
      if (body) {
        // Reset height first to get accurate scrollHeight
        if (iframeRef.current) iframeRef.current.style.height = "0px";
        const h = body.scrollHeight;
        const newH = Math.max(h + 32, 80);
        setHeight(newH);
        if (iframeRef.current) iframeRef.current.style.height = `${newH}px`;
      }
    } catch { /* cross-origin silent */ }
  };

  return (
    <div className="mb-6">
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        // allow-same-origin: needed for height detection
        // allow-popups: links open in new tab
        // allow-popups-to-escape-sandbox: opened links work normally
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts"
        className="w-full border-0 bg-transparent block"
        style={{ height, minHeight: 80 }}
        onLoad={resize}
        title="Email body"
      />
      {hasQuote && (
        <button
          onClick={onToggleQuoted}
          className="mt-1 flex items-center gap-1 text-[12px] text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] transition-colors"
        >
          {showQuoted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showQuoted ? "Masquer la conversation" : "Afficher la conversation"}
        </button>
      )}
    </div>
  );
}

// Tokenize plain text into clickable segments
type TextToken = { type: "url" | "email" | "tel" | "text"; value: string; href: string };
function tokenize(text: string): TextToken[] {
  // Match: full URLs, www. links, email addresses, phone numbers
  const re = /(https?:\/\/[^\s<>")\]]+|www\.[^\s<>")\]]+\.[^\s<>")\]]+|[\w.+-]+@[\w-]+\.[\w.]+|\+?[\d][\d\s().-]{6,}\d)/g;
  const tokens: TextToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: text.slice(last, m.index), href: "" });
    const raw = m[0].replace(/[.)]+$/, ""); // strip trailing punctuation
    if (/^https?:\/\//i.test(raw)) {
      tokens.push({ type: "url", value: raw, href: raw });
    } else if (/^www\./i.test(raw)) {
      tokens.push({ type: "url", value: raw, href: `https://${raw}` });
    } else if (/@/.test(raw)) {
      tokens.push({ type: "email", value: raw, href: `mailto:${raw}` });
    } else {
      tokens.push({ type: "tel", value: raw, href: `tel:${raw.replace(/\s/g, "")}` });
    }
    last = m.index + raw.length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last), href: "" });
  return tokens;
}

function EmailBodyText({ body, isDark }: { body: string; isDark: boolean }) {
  const tokens = tokenize(body);
  const linkColor = isDark ? "#a8c7fa" : "#1a73e8";
  return (
    <div className="mb-6 px-1" style={{ fontSize: 15, lineHeight: 1.85, color: isDark ? "#c4c7c5" : "#1a1a1a" }}>
      {tokens.map((t, i) =>
        t.type === "text" ? (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>{t.value}</span>
        ) : (
          <a key={i} href={t.href} target="_blank" rel="noopener noreferrer"
            style={{ color: linkColor, textDecoration: "underline", wordBreak: "break-all" }}>
            {t.value}
          </a>
        )
      )}
    </div>
  );
}
