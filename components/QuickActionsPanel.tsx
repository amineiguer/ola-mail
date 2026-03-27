"use client";

import { useState, useEffect, useCallback } from "react";
import {
  User, StickyNote, CheckSquare, Calendar, TrendingUp,
  MessageSquare, UserPlus, Search, Loader2, Check, X,
  ExternalLink, Link2, ChevronDown,
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

export default function QuickActionsPanel({
  emailId, emailFrom, emailSubject, linkedContact, onContactLinked,
  currentTags = [], currentCategory = null, onTagsApplied, onCompose, onClose,
  ghlUserId,
}: QuickActionsPanelProps) {
  const [expanded, setExpanded] = useState<ActionKey | null>(null);
  const [contact, setContact] = useState<LinkedContact | null>(linkedContact ?? null);

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

  const learnFromAction = useCallback((inferredCategory: string | null, inferredTags: string[]) => {
    fetch("/api/emails/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId, category: inferredCategory ?? currentCategory ?? null, tags: inferredTags, isContract: false, isDemandeInfo: false }),
    }).catch(() => {});
  }, [emailId, currentCategory]);

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

  const inp = "w-full text-[12px] bg-transparent border-b border-[#e8eaed] dark:border-[#3c4043] py-1.5 text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] focus:outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] transition-colors";
  const submitBtn = "mt-3 flex items-center gap-1.5 text-[12px] font-medium bg-[#1a73e8] hover:bg-[#1557b0] dark:bg-[#a8c7fa] dark:hover:bg-[#c2d9ff] text-white dark:text-[#062e6f] px-3 py-1 rounded-full transition-colors disabled:opacity-40";

  const requiresContact = !contact;

  const actions: { key: ActionKey; icon: React.ReactNode; label: string; disabled?: boolean }[] = [
    { key: "note",           icon: <StickyNote className="w-3.5 h-3.5" />,    label: "Note",          disabled: requiresContact },
    { key: "task",           icon: <CheckSquare className="w-3.5 h-3.5" />,   label: "Tâche",         disabled: requiresContact },
    { key: "calendar",       icon: <Calendar className="w-3.5 h-3.5" />,      label: "Rendez-vous" },
    { key: "opportunity",    icon: <TrendingUp className="w-3.5 h-3.5" />,    label: "Opportunité" },
    { key: "message",        icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Message",       disabled: requiresContact },
    { key: "create-contact", icon: <UserPlus className="w-3.5 h-3.5" />,      label: "Créer contact" },
  ];

  return (
    <div className="flex flex-col h-full text-[#202124] dark:text-[#e8eaed]">

      {/* ── Contact ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#f1f3f4] dark:border-[#3c4043]">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9aa0a6] mb-2">Contact</p>

        {contact ? (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#e8f0fe] dark:bg-[#1a2744] flex items-center justify-center text-[11px] font-bold text-[#1a73e8] dark:text-[#a8c7fa] flex-shrink-0">
              {contact.name[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium truncate">{contact.name}</p>
              {contact.email && <p className="text-[11px] text-[#9aa0a6] truncate">{contact.email}</p>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <a href={`https://app.gohighlevel.com/contacts/${contact.id}`} target="_blank" rel="noopener noreferrer"
                className="p-1 rounded hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors">
                <ExternalLink className="w-3 h-3 text-[#9aa0a6]" />
              </a>
              <button onClick={unlinkContact}
                className="p-1 rounded hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors">
                <X className="w-3 h-3 text-[#9aa0a6]" />
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => setShowSearch((v) => !v)}
              className="flex items-center gap-1.5 text-[12px] text-[#1a73e8] dark:text-[#a8c7fa] hover:opacity-70 transition-opacity">
              <Search className="w-3.5 h-3.5" />
              <span>Lier un contact</span>
            </button>
            {showSearch && (
              <div className="mt-2">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nom ou email..." className={inp} autoFocus />
                {isSearching && (
                  <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-[#9aa0a6]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Recherche…
                  </div>
                )}
                <div className="mt-1 space-y-0.5">
                  {searchResults.map((c) => {
                    const name = (c.name ?? `${(c.firstName ?? "")} ${(c.lastName ?? "")}`.trim()) || "—";
                    return (
                      <button key={c.id} onClick={() => linkContact(c)}
                        className="w-full flex items-center gap-2 px-1 py-1.5 rounded hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] text-left transition-colors">
                        <span className="w-5 h-5 rounded-full bg-[#e8f0fe] dark:bg-[#1a2744] flex items-center justify-center text-[9px] font-bold text-[#1a73e8] dark:text-[#a8c7fa] flex-shrink-0">
                          {name[0]?.toUpperCase() ?? "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[12px] truncate font-medium">{name}</p>
                          {c.email && <p className="text-[10px] text-[#9aa0a6] truncate">{c.email}</p>}
                        </div>
                        <Link2 className="w-3 h-3 text-[#9aa0a6] flex-shrink-0 ml-auto" />
                      </button>
                    );
                  })}
                  {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
                    <p className="text-[11px] text-[#9aa0a6] py-1">Aucun résultat</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Actions list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {actions.map(({ key, icon, label, disabled }) => {
          const isOpen = expanded === key;
          const state = actionState[key];
          return (
            <div key={key}>
              <button
                onClick={() => !disabled && toggle(key)}
                disabled={disabled}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors
                  ${isOpen ? "bg-[#f8f9fa] dark:bg-[#2d2e30]" : "hover:bg-[#f8f9fa] dark:hover:bg-[#2d2e30]"}
                  ${disabled ? "opacity-35 cursor-not-allowed" : ""}`}
              >
                <span className="text-[#9aa0a6] flex-shrink-0">{icon}</span>
                <span className="flex-1 text-[12px] font-medium">{label}</span>
                {state === "success" && <Check className="w-3.5 h-3.5 text-[#137333] dark:text-[#81c995]" />}
                {state === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1a73e8]" />}
                {state === "idle" && !disabled && (
                  <ChevronDown className={`w-3.5 h-3.5 text-[#dadce0] transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-3 pt-1 border-t border-b border-[#f1f3f4] dark:border-[#3c4043] bg-[#f8f9fa] dark:bg-[#2d2e30]">
                  {actionError[key] && (
                    <p className="text-[11px] text-[#c5221f] mb-2">{actionError[key]}</p>
                  )}

                  {key === "note" && (
                    <>
                      <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)}
                        placeholder="Note pour le contact…" rows={3} className={`${inp} resize-none`} />
                      <button onClick={doNote} disabled={!noteBody.trim() || state === "loading"} className={submitBtn}>
                        {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Enregistrer
                      </button>
                    </>
                  )}

                  {key === "task" && (
                    <div className="space-y-2">
                      <input type="text" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Titre de la tâche" className={inp} />
                      <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={inp} />
                      <input type="text" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Description (optionnel)" className={inp} />
                      <button onClick={doTask} disabled={!taskTitle.trim() || state === "loading"} className={submitBtn}>
                        {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Créer
                      </button>
                    </div>
                  )}

                  {key === "calendar" && (
                    <div className="space-y-2">
                      <input type="text" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="Titre" className={inp} />
                      <div className="flex gap-2">
                        <input type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} className={`${inp} flex-1`} />
                        <input type="time" value={calTime} onChange={(e) => setCalTime(e.target.value)} className={`${inp} w-[90px]`} />
                      </div>
                      <textarea value={calDesc} onChange={(e) => setCalDesc(e.target.value)} placeholder="Notes (optionnel)" rows={2} className={`${inp} resize-none`} />
                      <button onClick={doCalendar} disabled={!calTitle.trim() || !calDate || state === "loading"} className={submitBtn}>
                        {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                        Ouvrir Calendar
                      </button>
                    </div>
                  )}

                  {key === "opportunity" && (
                    <div className="space-y-2">
                      <input type="text" value={oppName} onChange={(e) => setOppName(e.target.value)} placeholder="Nom" className={inp} />
                      {!pipelinesLoaded ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-[#9aa0a6]">
                          <Loader2 className="w-3 h-3 animate-spin" /> Chargement…
                        </div>
                      ) : pipelines.length === 0 ? (
                        <p className="text-[11px] text-[#9aa0a6]">Aucun pipeline trouvé</p>
                      ) : (
                        <>
                          <select value={oppPipelineId} onChange={(e) => { setOppPipelineId(e.target.value); const pl = pipelines.find((p) => p.id === e.target.value); setOppStageId(pl?.stages?.[0]?.id ?? ""); }} className={inp}>
                            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <select value={oppStageId} onChange={(e) => setOppStageId(e.target.value)} className={inp}>
                            {(pipelines.find((p) => p.id === oppPipelineId)?.stages ?? []).map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </>
                      )}
                      <input type="number" value={oppValue} onChange={(e) => setOppValue(e.target.value)} placeholder="Valeur ($)" className={inp} />
                      <button onClick={doOpportunity} disabled={!oppName.trim() || !oppPipelineId || !oppStageId || state === "loading"} className={submitBtn}>
                        {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Créer
                      </button>
                    </div>
                  )}

                  {key === "message" && (
                    <div className="space-y-2">
                      <select value={msgType} onChange={(e) => setMsgType(e.target.value as "SMS" | "Email")} className={inp}>
                        <option value="SMS">SMS</option>
                        <option value="Email">Email</option>
                      </select>
                      <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Message…" rows={3} className={`${inp} resize-none`} />
                      <button onClick={doMessage} disabled={!msgText.trim() || state === "loading"} className={submitBtn}>
                        {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Envoyer
                      </button>
                    </div>
                  )}

                  {key === "create-contact" && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input type="text" value={ccFirstName} onChange={(e) => setCcFirstName(e.target.value)} placeholder="Prénom" className={`${inp} flex-1`} />
                        <input type="text" value={ccLastName} onChange={(e) => setCcLastName(e.target.value)} placeholder="Nom" className={`${inp} flex-1`} />
                      </div>
                      <input type="email" value={ccEmail} onChange={(e) => setCcEmail(e.target.value)} placeholder="Email" className={inp} />
                      <input type="tel" value={ccPhone} onChange={(e) => setCcPhone(e.target.value)} placeholder="Téléphone (optionnel)" className={inp} />
                      <button onClick={doCreateContact} disabled={(!ccFirstName.trim() && !ccEmail.trim()) || state === "loading"} className={submitBtn}>
                        {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                        Créer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
