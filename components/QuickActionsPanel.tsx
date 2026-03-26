"use client";

import { useState, useEffect, useCallback } from "react";
import {
  User, StickyNote, CheckSquare, Calendar, TrendingUp,
  MessageSquare, UserPlus, Search, ChevronDown, ChevronRight,
  Loader2, Check, X, ExternalLink, Link2, Sparkles, Tag, Mail,
} from "lucide-react";

interface LinkedContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface GHLContact {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface Pipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
}

interface QuickActionsPanelProps {
  emailId: string;
  emailFrom: string;
  emailSubject: string;
  linkedContact?: LinkedContact;
  onContactLinked: (emailId: string, contact: LinkedContact | null) => void;
  currentTags?: string[];
  currentCategory?: string | null;
  onTagsApplied?: (emailId: string, tags: string[], category: string | null) => void;
  onCompose?: () => void;
  onClose?: () => void;
  ghlUserId?: string;
}

type ActionKey = "note" | "task" | "calendar" | "opportunity" | "message" | "create-contact";

const CATEGORY_LABELS: Record<string, string> = {
  lead: "Lead", client: "Client", visite: "Visite", contrat: "Contrat",
  offre: "Offre d'achat", signature: "Signature", inspection: "Inspection",
  financement: "Financement", notaire: "Notaire", autre: "Autre",
};

const CATEGORY_COLORS: Record<string, string> = {
  lead: "#1a73e8", client: "#137333", visite: "#b06000", contrat: "#c5221f",
  offre: "#7b1fa2", signature: "#0097a7", inspection: "#e65100",
  financement: "#1565c0", notaire: "#4a148c", autre: "#5f6368",
};

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  "urgent":        { bg: "#fce8e6", text: "#c5221f" },
  "action-required":{ bg: "#fef7e0", text: "#b06000" },
  "fyi":           { bg: "#f1f3f4", text: "#5f6368" },
  "lead":          { bg: "#e8f0fe", text: "#1a73e8" },
  "client":        { bg: "#e6f4ea", text: "#137333" },
  "visite":        { bg: "#fef7e0", text: "#b06000" },
  "contrat":       { bg: "#fce8e6", text: "#c5221f" },
  "offre":         { bg: "#f3e8fd", text: "#7b1fa2" },
  "signature":     { bg: "#e0f7fa", text: "#0097a7" },
  "inspection":    { bg: "#fbe9e7", text: "#e65100" },
  "financement":   { bg: "#e3f2fd", text: "#1565c0" },
  "notaire":       { bg: "#ede7f6", text: "#4a148c" },
};

export default function QuickActionsPanel({
  emailId, emailFrom, emailSubject, linkedContact, onContactLinked,
  currentTags = [], currentCategory = null, onTagsApplied, onCompose, onClose,
  ghlUserId,
}: QuickActionsPanelProps) {
  const [expanded, setExpanded] = useState<ActionKey | null>(null);
  const [contact, setContact] = useState<LinkedContact | null>(linkedContact ?? null);

  // ── AI Classify state ─────────────────────────────────────────────────────
  const [classifyState, setClassifyState] = useState<"idle" | "loading" | "done">("idle");
  const [classifyResult, setClassifyResult] = useState<{
    category: string | null;
    tags: string[];
    confidence: number;
  } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [applyState, setApplyState] = useState<"idle" | "loading" | "done">("idle");

  // Contact search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GHLContact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Pipelines
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelinesLoaded, setPipelinesLoaded] = useState(false);

  // Status per action
  const [actionState, setActionState] = useState<Record<ActionKey, "idle" | "loading" | "success" | "error">>({
    note: "idle", task: "idle", calendar: "idle",
    opportunity: "idle", message: "idle", "create-contact": "idle",
  });
  const [actionError, setActionError] = useState<Partial<Record<ActionKey, string>>>({});

  // Form fields
  const [noteBody, setNoteBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [calTitle, setCalTitle] = useState(emailSubject);
  const [calDate, setCalDate] = useState("");
  const [calTime, setCalTime] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [oppName, setOppName] = useState(emailSubject);
  const [oppPipelineId, setOppPipelineId] = useState("");
  const [oppStageId, setOppStageId] = useState("");
  const [oppValue, setOppValue] = useState("");
  const [msgText, setMsgText] = useState("");
  const [msgType, setMsgType] = useState<"SMS" | "Email">("SMS");

  const senderName = emailFrom.replace(/<[^>]+>/, "").replace(/"/g, "").trim();
  const senderEmail = emailFrom.match(/<([^>]+)>/)?.[1] ?? "";
  const [ccFirstName, setCcFirstName] = useState(() => senderName.split(" ")[0] ?? "");
  const [ccLastName, setCcLastName] = useState(() => senderName.split(" ").slice(1).join(" ") ?? "");
  const [ccEmail, setCcEmail] = useState(senderEmail);
  const [ccPhone, setCcPhone] = useState("");

  useEffect(() => { setContact(linkedContact ?? null); }, [linkedContact]);

  // ── Learning signal helper ────────────────────────────────────────────────
  const learnFromAction = useCallback((inferredCategory: string | null, inferredTags: string[]) => {
    const allTags = inferredTags.filter((t, i, a) => a.indexOf(t) === i);
    fetch("/api/emails/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailId,
        category: inferredCategory ?? currentCategory ?? null,
        tags: allTags,
        isContract: false,
        isDemandeInfo: false,
      }),
    }).catch(() => {});
  }, [emailId, currentCategory]);

  // ── AI Classify ───────────────────────────────────────────────────────────
  const doClassify = async () => {
    setClassifyState("loading");
    setClassifyResult(null);
    setApplyState("idle");
    try {
      const res = await fetch("/api/emails/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const result = {
        category: data.aiTags?.category ?? null,
        tags: (data.aiTags?.suggestedTags ?? []) as string[],
        confidence: data.analysis?.confidence ?? 0,
      };
      setClassifyResult(result);
      // Pre-select tags that aren't already applied
      setSelectedTags(result.tags.filter((t: string) => !currentTags.includes(t)));
      setClassifyState("done");
    } catch {
      setClassifyState("idle");
    }
  };

  const doApply = async () => {
    if (!classifyResult || selectedTags.length === 0) return;
    setApplyState("loading");
    try {
      for (const tag of selectedTags) {
        await fetch(`/api/emails/${emailId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId: tag }),
        });
      }
      // Save confirmed learning signal
      learnFromAction(classifyResult.category, selectedTags);
      onTagsApplied?.(emailId, selectedTags, classifyResult.category);
      setApplyState("done");
    } catch {
      setApplyState("idle");
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // ── Contact ───────────────────────────────────────────────────────────────
  const setAction = (key: ActionKey, state: "idle" | "loading" | "success" | "error", err?: string) => {
    setActionState((p) => ({ ...p, [key]: state }));
    if (err) setActionError((p) => ({ ...p, [key]: err }));
    else setActionError((p) => { const n = { ...p }; delete n[key]; return n; });
  };

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.contacts ?? []);
    } catch { setSearchResults([]); }
    finally { setIsSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => handleSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery, handleSearch]);

  const linkContact = async (c: GHLContact) => {
    const name = (c.name ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()) || "Contact OLA";
    const linked: LinkedContact = { id: c.id, name, email: c.email, phone: c.phone };
    await fetch(`/api/emails/${emailId}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: linked }),
    });
    setContact(linked);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    onContactLinked(emailId, linked);
  };

  const unlinkContact = async () => {
    await fetch(`/api/emails/${emailId}/contact`, { method: "DELETE" });
    setContact(null);
    onContactLinked(emailId, null);
  };

  const loadPipelines = async () => {
    if (pipelinesLoaded) return;
    try {
      const res = await fetch("/api/ghl/pipelines");
      const data = await res.json();
      setPipelines(data.pipelines ?? []);
      if (data.pipelines?.length > 0) {
        setOppPipelineId(data.pipelines[0].id);
        setOppStageId(data.pipelines[0].stages?.[0]?.id ?? "");
      }
    } catch { /**/ }
    finally { setPipelinesLoaded(true); }
  };

  const toggle = (key: ActionKey) => {
    setExpanded((v) => v === key ? null : key);
    if (key === "opportunity") loadPipelines();
  };

  // ── Action handlers (each one sends a learning signal) ───────────────────

  const doNote = async () => {
    if (!noteBody.trim()) return;
    setAction("note", "loading");
    try {
      const res = await fetch("/api/ghl/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact?.id, body: noteBody, userId: ghlUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAction("note", "success");
      setNoteBody("");
      learnFromAction(currentCategory ?? "client", [...currentTags]);
      setTimeout(() => { setAction("note", "idle"); setExpanded(null); }, 1500);
    } catch (e) { setAction("note", "error", e instanceof Error ? e.message : "Erreur"); }
  };

  const doTask = async () => {
    if (!taskTitle.trim()) return;
    setAction("task", "loading");
    try {
      const res = await fetch("/api/ghl/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact?.id, title: taskTitle, dueDate: taskDue || undefined, description: taskDesc || undefined, assignedTo: ghlUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAction("task", "success");
      setTaskTitle(""); setTaskDue(""); setTaskDesc("");
      learnFromAction(currentCategory ?? "lead", [...currentTags, "action-required"]);
      setTimeout(() => { setAction("task", "idle"); setExpanded(null); }, 1500);
    } catch (e) { setAction("task", "error", e instanceof Error ? e.message : "Erreur"); }
  };

  const doOpportunity = async () => {
    if (!oppName.trim() || !oppPipelineId || !oppStageId) return;
    setAction("opportunity", "loading");
    try {
      const res = await fetch("/api/ghl/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: oppName, pipelineId: oppPipelineId, stageId: oppStageId, contactId: contact?.id, monetaryValue: oppValue ? Number(oppValue) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAction("opportunity", "success");
      learnFromAction(currentCategory ?? "lead", [...currentTags, "lead", "action-required"]);
      setTimeout(() => { setAction("opportunity", "idle"); setExpanded(null); }, 1500);
    } catch (e) { setAction("opportunity", "error", e instanceof Error ? e.message : "Erreur"); }
  };

  const doMessage = async () => {
    if (!msgText.trim() || !contact?.id) return;
    setAction("message", "loading");
    try {
      const res = await fetch("/api/ghl/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, message: msgText, type: msgType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAction("message", "success");
      setMsgText("");
      learnFromAction(currentCategory ?? "client", [...currentTags, "client"]);
      setTimeout(() => { setAction("message", "idle"); setExpanded(null); }, 1500);
    } catch (e) { setAction("message", "error", e instanceof Error ? e.message : "Erreur"); }
  };

  const doCreateContact = async () => {
    if (!ccFirstName.trim() && !ccEmail.trim()) return;
    setAction("create-contact", "loading");
    try {
      const res = await fetch("/api/ghl/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: ccFirstName, lastName: ccLastName, email: ccEmail, phone: ccPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const created = data.contact;
      const linked: LinkedContact = { id: created.id, name: created.name ?? `${ccFirstName} ${ccLastName}`.trim(), email: ccEmail, phone: ccPhone };
      await fetch(`/api/emails/${emailId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: linked }),
      });
      setContact(linked);
      onContactLinked(emailId, linked);
      learnFromAction("client", [...currentTags, "client", "lead"]);
      setAction("create-contact", "success");
      setTimeout(() => { setAction("create-contact", "idle"); setExpanded(null); }, 1500);
    } catch (e) { setAction("create-contact", "error", e instanceof Error ? e.message : "Erreur"); }
  };

  const doCalendar = async () => {
    if (!calTitle.trim() || !calDate) return;
    setAction("calendar", "loading");
    try {
      const dtStart = calTime ? `${calDate}T${calTime}:00` : `${calDate}T09:00:00`;
      const endH = calTime ? String(Number(calTime.split(":")[0]) + 1).padStart(2, "0") : "10";
      const endMin = calTime ? calTime.split(":")[1] : "00";
      const dtEnd = `${calDate}T${endH}:${endMin}:00`;
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calTitle)}&dates=${dtStart.replace(/[-:]/g, "")}/${dtEnd.replace(/[-:]/g, "")}&details=${encodeURIComponent(calDesc || emailSubject)}`;
      window.open(url, "_blank");
      learnFromAction(currentCategory ?? "visite", [...currentTags, "visite"]);
      setAction("calendar", "success");
      setTimeout(() => { setAction("calendar", "idle"); setExpanded(null); }, 1500);
    } catch (e) { setAction("calendar", "error", e instanceof Error ? e.message : "Erreur"); }
  };

  // ── UI helpers ────────────────────────────────────────────────────────────
  const inputCls = "w-full text-[13px] bg-transparent border border-[#e0e0e0] dark:border-[#3c4043] rounded-lg px-3 py-1.5 text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] focus:outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] transition-colors";
  const btnCls = "flex items-center gap-1.5 text-[12px] font-medium bg-[#1a73e8] hover:bg-[#1557b0] dark:bg-[#a8c7fa] dark:hover:bg-[#c2d9ff] text-white dark:text-[#062e6f] px-4 py-1.5 rounded-full transition-colors disabled:opacity-40";

  const ActionSection = ({
    actionKey, icon, label, children, disabled = false,
  }: {
    actionKey: ActionKey; icon: React.ReactNode; label: string; children: React.ReactNode; disabled?: boolean;
  }) => {
    const isOpen = expanded === actionKey;
    const state = actionState[actionKey];
    return (
      <div className="border border-[#e0e0e0] dark:border-[#3c4043] rounded-xl overflow-hidden">
        <button
          onClick={() => !disabled && toggle(actionKey)}
          disabled={disabled}
          className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors
            ${isOpen ? "bg-[#f6f8fc] dark:bg-[#2d2e30]" : "hover:bg-[#f6f8fc] dark:hover:bg-[#2d2e30]"}
            ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          <span className="text-[#5f6368] dark:text-[#9aa0a6] flex-shrink-0">{icon}</span>
          <span className="flex-1 text-[13px] font-medium text-[#202124] dark:text-[#e8eaed]">{label}</span>
          {state === "success" && <Check className="w-4 h-4 text-[#137333] dark:text-[#81c995]" />}
          {state === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1a73e8] dark:text-[#a8c7fa]" />}
          {state === "idle" && (isOpen ? <ChevronDown className="w-4 h-4 text-[#9aa0a6]" /> : <ChevronRight className="w-4 h-4 text-[#9aa0a6]" />)}
        </button>
        {isOpen && (
          <div className="px-3 pb-3 pt-1 border-t border-[#e0e0e0] dark:border-[#3c4043] bg-white dark:bg-[#202124]">
            {actionError[actionKey] && (
              <p className="text-[11px] text-[#c5221f] dark:text-[#f28b82] mb-2">{actionError[actionKey]}</p>
            )}
            {children}
          </div>
        )}
      </div>
    );
  };

  const requiresContact = !contact;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#e0e0e0] dark:border-[#3c4043] flex-shrink-0">
        <p className="text-[11px] font-semibold text-[#9aa0a6] uppercase tracking-wider">
          Actions rapides
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
            title="Fermer"
          >
            <X className="w-3.5 h-3.5 text-[#5f6368] dark:text-[#9aa0a6]" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">

      {/* ── Contact Card ─────────────────────────────────────────────────── */}
      <div className="border border-[#e0e0e0] dark:border-[#3c4043] rounded-xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#f6f8fc] dark:bg-[#2d2e30]">
          <User className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6] flex-shrink-0" />
          <span className="flex-1 text-[13px] font-medium text-[#202124] dark:text-[#e8eaed] truncate">
            {contact ? contact.name : "Aucun contact OLA"}
          </span>
          {contact && (
            <a href={`https://app.gohighlevel.com/contacts/${contact.id}`} target="_blank" rel="noopener noreferrer"
              className="text-[#1a73e8] dark:text-[#a8c7fa] hover:opacity-70 flex-shrink-0">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        {contact ? (
          <div className="px-3 py-2 bg-white dark:bg-[#202124] border-t border-[#e0e0e0] dark:border-[#3c4043]">
            {contact.email && <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6] truncate">{contact.email}</p>}
            {contact.phone && <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">{contact.phone}</p>}
            <button onClick={unlinkContact} className="mt-1.5 text-[11px] text-[#c5221f] dark:text-[#f28b82] hover:underline flex items-center gap-1">
              <X className="w-3 h-3" /> Dissocier
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 bg-white dark:bg-[#202124] border-t border-[#e0e0e0] dark:border-[#3c4043]">
            <button onClick={() => setShowSearch((v) => !v)}
              className="flex items-center gap-1.5 text-[12px] text-[#1a73e8] dark:text-[#a8c7fa] hover:underline">
              <Search className="w-3.5 h-3.5" /> Rechercher un contact OLA
            </button>
            {showSearch && (
              <div className="mt-2 space-y-1.5">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nom ou email..." className={inputCls} autoFocus />
                {isSearching && (
                  <div className="flex items-center gap-1.5 py-1 text-[12px] text-[#9aa0a6]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Recherche…
                  </div>
                )}
                {searchResults.map((c) => {
                  const name = (c.name ?? `${(c.firstName ?? "")} ${(c.lastName ?? "")}`.trim()) || "—";
                  return (
                    <button key={c.id} onClick={() => linkContact(c)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] text-left transition-colors">
                      <span className="w-6 h-6 rounded-full bg-[#e8f0fe] dark:bg-[#1a2744] flex items-center justify-center text-[10px] font-bold text-[#1a73e8] dark:text-[#a8c7fa] flex-shrink-0">
                        {name[0]?.toUpperCase() ?? "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] text-[#202124] dark:text-[#e8eaed] truncate font-medium">{name}</p>
                        {c.email && <p className="text-[11px] text-[#9aa0a6] truncate">{c.email}</p>}
                      </div>
                      <Link2 className="w-3 h-3 text-[#9aa0a6] flex-shrink-0 ml-auto" />
                    </button>
                  );
                })}
                {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
                  <p className="text-[12px] text-[#9aa0a6] py-1">Aucun résultat</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Note ─────────────────────────────────────────────────────────── */}
      <ActionSection actionKey="note" icon={<StickyNote className="w-4 h-4" />} label="Ajouter une note" disabled={requiresContact}>
        <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)}
          placeholder="Note à ajouter au contact OLA..." rows={3} className={`${inputCls} resize-none mt-1`} />
        <button onClick={doNote} disabled={!noteBody.trim() || actionState.note === "loading"} className={`${btnCls} mt-2`}>
          {actionState.note === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
      </ActionSection>

      {/* ── Task ─────────────────────────────────────────────────────────── */}
      <ActionSection actionKey="task" icon={<CheckSquare className="w-4 h-4" />} label="Créer une tâche" disabled={requiresContact}>
        <div className="space-y-2 mt-1">
          <input type="text" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Titre de la tâche" className={inputCls} />
          <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={inputCls} />
          <input type="text" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Description (optionnel)" className={inputCls} />
          <button onClick={doTask} disabled={!taskTitle.trim() || actionState.task === "loading"} className={btnCls}>
            {actionState.task === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Créer
          </button>
        </div>
      </ActionSection>

      {/* ── Calendar ─────────────────────────────────────────────────────── */}
      <ActionSection actionKey="calendar" icon={<Calendar className="w-4 h-4" />} label="Créer un rendez-vous">
        <div className="space-y-2 mt-1">
          <input type="text" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="Titre" className={inputCls} />
          <div className="flex gap-2">
            <input type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} className={`${inputCls} flex-1`} />
            <input type="time" value={calTime} onChange={(e) => setCalTime(e.target.value)} className={`${inputCls} w-[100px]`} />
          </div>
          <textarea value={calDesc} onChange={(e) => setCalDesc(e.target.value)} placeholder="Notes (optionnel)" rows={2} className={`${inputCls} resize-none`} />
          <button onClick={doCalendar} disabled={!calTitle.trim() || !calDate || actionState.calendar === "loading"} className={btnCls}>
            {actionState.calendar === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            Ouvrir Google Calendar
          </button>
        </div>
      </ActionSection>

      {/* ── Opportunity ──────────────────────────────────────────────────── */}
      <ActionSection actionKey="opportunity" icon={<TrendingUp className="w-4 h-4" />} label="Créer une opportunité">
        <div className="space-y-2 mt-1">
          <input type="text" value={oppName} onChange={(e) => setOppName(e.target.value)} placeholder="Nom de l'opportunité" className={inputCls} />
          {!pipelinesLoaded ? (
            <div className="flex items-center gap-1.5 text-[12px] text-[#9aa0a6]">
              <Loader2 className="w-3 h-3 animate-spin" /> Chargement pipelines…
            </div>
          ) : pipelines.length === 0 ? (
            <p className="text-[12px] text-[#9aa0a6]">Aucun pipeline OLA trouvé</p>
          ) : (
            <>
              <select value={oppPipelineId} onChange={(e) => {
                setOppPipelineId(e.target.value);
                const pl = pipelines.find((p) => p.id === e.target.value);
                setOppStageId(pl?.stages?.[0]?.id ?? "");
              }} className={inputCls}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={oppStageId} onChange={(e) => setOppStageId(e.target.value)} className={inputCls}>
                {(pipelines.find((p) => p.id === oppPipelineId)?.stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </>
          )}
          <input type="number" value={oppValue} onChange={(e) => setOppValue(e.target.value)} placeholder="Valeur ($)" className={inputCls} />
          <button onClick={doOpportunity} disabled={!oppName.trim() || !oppPipelineId || !oppStageId || actionState.opportunity === "loading"} className={btnCls}>
            {actionState.opportunity === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Créer
          </button>
        </div>
      </ActionSection>

      {/* ── Message ──────────────────────────────────────────────────────── */}
      <ActionSection actionKey="message" icon={<MessageSquare className="w-4 h-4" />} label="Envoyer un message" disabled={requiresContact}>
        <div className="space-y-2 mt-1">
          <select value={msgType} onChange={(e) => setMsgType(e.target.value as "SMS" | "Email")} className={inputCls}>
            <option value="SMS">SMS</option>
            <option value="Email">Email</option>
          </select>
          <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Message..." rows={3} className={`${inputCls} resize-none`} />
          <button onClick={doMessage} disabled={!msgText.trim() || actionState.message === "loading"} className={btnCls}>
            {actionState.message === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Envoyer
          </button>
        </div>
      </ActionSection>

      {/* ── Create contact ───────────────────────────────────────────────── */}
      <ActionSection actionKey="create-contact" icon={<UserPlus className="w-4 h-4" />} label="Créer un contact OLA">
        <div className="space-y-2 mt-1">
          <div className="flex gap-2">
            <input type="text" value={ccFirstName} onChange={(e) => setCcFirstName(e.target.value)} placeholder="Prénom" className={`${inputCls} flex-1`} />
            <input type="text" value={ccLastName} onChange={(e) => setCcLastName(e.target.value)} placeholder="Nom" className={`${inputCls} flex-1`} />
          </div>
          <input type="email" value={ccEmail} onChange={(e) => setCcEmail(e.target.value)} placeholder="Email" className={inputCls} />
          <input type="tel" value={ccPhone} onChange={(e) => setCcPhone(e.target.value)} placeholder="Téléphone (optionnel)" className={inputCls} />
          <button onClick={doCreateContact} disabled={(!ccFirstName.trim() && !ccEmail.trim()) || actionState["create-contact"] === "loading"} className={btnCls}>
            {actionState["create-contact"] === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Créer dans OLA
          </button>
        </div>
      </ActionSection>
      </div>
    </div>
  );
}
