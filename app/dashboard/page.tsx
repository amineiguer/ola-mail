"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Mail, FileText, LogOut, AlertCircle, Loader2,
  FolderOpen, Inbox, ChevronDown, ChevronUp, ChevronRight, Sun, Moon,
  Search, Menu, Settings, Plus, Tag, Zap, Bell, Eye,
  Users, Home, FileCheck, Building, SlidersHorizontal, X, GripVertical,
} from "lucide-react";
import EmailList from "@/components/EmailList";
import ContractCard from "@/components/ContractCard";
import VisitesCalendar from "@/components/VisitesCalendar";
import ConnectGmail from "@/components/ConnectGmail";
import RulesModal from "@/components/RulesModal";
import CreateTagModal from "@/components/CreateTagModal";
import ComposePanel from "@/components/ComposePanel";
import { Tag as TagType } from "@/lib/tags-config";
import { CustomTag, Rule } from "@/lib/storage";

export interface AiTags {
  needsReply: boolean;
  urgency: "urgent" | "normal" | "low";
  suggestedTags: string[];
  category: string | null;
  analyzedAt: string;
}

export interface LinkedContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface EmailItem {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
  bodyHtml?: string;
  hasAttachment: boolean;
  attachments: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }>;
  analysis?: {
    isContract: boolean;
    propertyName: string | null;
    confidence: number;
    analyzedAt: string;
    extractedContact?: {
      name?: string;
      email?: string;
      phone?: string;
      propertyAddress?: string;
      isDemandeInfo: boolean;
    };
  };
  ghlUpload?: { uploaded: boolean; folderId?: string; fileUrl?: string; uploadedAt?: string; error?: string; isMock?: boolean };
  isRead?: boolean;
  tags?: string[];
  aiTags?: AiTags;
  linkedContact?: LinkedContact;
}

export interface Stats {
  totalEmails: number;
  contractsFound: number;
  uploadedToGhl: number;
  pendingAnalysis: number;
}

interface GmailLabel { id: string; name: string; type: string }

type SidebarFilter =
  | { type: "all" }
  | { type: "tag"; value: string }
  | { type: "gmail-label"; value: string }
  | { type: "needs-reply" }
  | { type: "urgent-filter" }
  | { type: "contact"; value: string };

/** Parse "Name <email>" or "email" into { name, email } */
function parseSender(from: string): { name: string; email: string } {
  const m = from.match(/^([^<]*)<([^>]+)>/);
  if (m) return { name: m[1].replace(/"/g, "").trim(), email: m[2].trim().toLowerCase() };
  return { name: from.trim(), email: from.trim().toLowerCase() };
}

type Lang = "fr" | "en";

const UI: Record<Lang, Record<string, string>> = {
  fr: {
    inbox: "Boîte de réception",
    all: "Tout",
    contracts: "Contrats",
    pending: "À analyser",
    sync: "Sync",
    settings: "Paramètres",
    urgent: "Urgent",
    "action-required": "Action requise",
    fyi: "À lire",
    realestate: "Immobilier",
    myTags: "Mes étiquettes",
    gmailFolders: "Dossiers Gmail",
    rules: "Règles",
    showMore: "de plus",
    showLess: "Voir moins",
    smartFilter: "Immobilier seulement",
    allFilter: "Tous les emails",
    newEmails: "nouveau",
    newEmailsPlural: "nouveaux",
    newEmailsBanner: "— Cliquer pour actualiser",
    disconnect: "Déconnexion",
  },
  en: {
    inbox: "Inbox",
    all: "All",
    contracts: "Contracts",
    pending: "Pending",
    sync: "Sync",
    settings: "Settings",
    urgent: "Urgent",
    "action-required": "Action Required",
    fyi: "To Read",
    realestate: "Real Estate",
    myTags: "My Tags",
    gmailFolders: "Gmail Folders",
    rules: "Rules",
    showMore: "more",
    showLess: "Show less",
    smartFilter: "Real estate only",
    allFilter: "All emails",
    newEmails: "new",
    newEmailsPlural: "new",
    newEmailsBanner: "— Click to refresh",
    disconnect: "Disconnect",
  },
};

const ACTION_NAV_KEYS = [
  { id: "urgent",          icon: AlertCircle, emoji: "🔴" },
  { id: "action-required", icon: Zap,         emoji: "⚡" },
  { id: "fyi",             icon: Eye,         emoji: "👀" },
];

const REALESTATE_NAV = [
  { id: "lead",        label: "Lead",          icon: Users },
  { id: "client",      label: "Client",        icon: Users },
  { id: "contrat",     label: "Contrat",       icon: FileText },
  { id: "visite",      label: "Visite",        icon: Home },
  { id: "offre",       label: "Offre d'achat", icon: FileCheck },
  { id: "signature",   label: "Signature",     icon: FileCheck },
  { id: "inspection",  label: "Inspection",    icon: Search },
  { id: "financement", label: "Financement",   icon: Building },
  { id: "notaire",     label: "Notaire",       icon: FileText },
];

function emailMatchesTag(email: EmailItem, tagId: string): boolean {
  return (email.tags?.includes(tagId) ?? false) ||
    (email.aiTags?.suggestedTags?.includes(tagId) ?? false);
}

export default function DashboardPage() {
  const router = useRouter();

  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [stats, setStats] = useState<Stats>({ totalEmails: 0, contractsFound: 0, uploadedToGhl: 0, pendingAnalysis: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [newEmailsCount, setNewEmailsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [immobilierExpanded, setImmobilierExpanded] = useState(true);
  const [mesEtiquettesExpanded, setMesEtiquettesExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"actions" | "inbox" | "all" | "visites" | "leads" | "contrats" | "immocontact" | "centris">("actions");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({ type: "all" });
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showCreateTagModal, setShowCreateTagModal] = useState(false);
  const [showComposeFreeform, setShowComposeFreeform] = useState(false);
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [syncDays, setSyncDays] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return Number(localStorage.getItem("ola-sync-days") ?? "30");
    }
    return 30;
  });
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [autoBrand, setAutoBrand] = useState(() => typeof window !== "undefined" ? localStorage.getItem("ola-auto-brand") === "true" : false);
  const [autoSignature, setAutoSignature] = useState(() => typeof window !== "undefined" ? localStorage.getItem("ola-auto-signature") === "true" : false);
  const [signatureText, setSignatureText] = useState(() => typeof window !== "undefined" ? (localStorage.getItem("ola-signature-text") ?? "") : "");
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const [ghlApiKey, setGhlApiKey] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [ghlConnected, setGhlConnected] = useState(false);
  const [ghlSaving, setGhlSaving] = useState(false);
  const [crmMemberAccess, setCrmMemberAccess] = useState(false);
  const [ghlUser, setGhlUser] = useState<{ id: string; name?: string; firstName?: string; lastName?: string; email?: string; phone?: string; profilePhoto?: string; role?: string } | null>(null);
  const [ghlLocation, setGhlLocation] = useState<{ id: string; name?: string } | null>(null);
  const [ghlUserLoading, setGhlUserLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [lang, setLang] = useState<Lang>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("ola-lang") as Lang ?? "fr") : "fr"
  );
  const [smartFilter, setSmartFilter] = useState(false);
  const [clientsExpanded, setClientsExpanded] = useState(true);
  const [clientSearch, setClientSearch] = useState("");
  const [sidebarSectionOrder, setSidebarSectionOrder] = useState<("gmail" | "clients")[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("ola-section-order") ?? "null") ?? ["gmail", "clients"]; } catch { /* ignore */ }
    }
    return ["gmail", "clients"];
  });
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const dragSectionRef = useRef<string | null>(null);

  const t = (key: string) => UI[lang][key] ?? key;
  const syncSettingsRef = useRef<HTMLDivElement>(null);

  // Close sync settings on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (syncSettingsRef.current && !syncSettingsRef.current.contains(e.target as Node)) {
        setShowSyncSettings(false);
      }
    }
    if (showSyncSettings) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSyncSettings]);

  // Close settings panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsPanelRef.current && !settingsPanelRef.current.contains(e.target as Node)) {
        setShowSettingsPanel(false);
      }
    }
    if (showSettingsPanel) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettingsPanel]);

  // Fetch GHL user context
  const fetchGhlUser = useCallback(async () => {
    setGhlUserLoading(true);
    try {
      const res = await fetch("/api/ghl/user");
      if (res.ok) {
        const data = await res.json();
        if (data.user) setGhlUser(data.user);
        if (data.location) setGhlLocation(data.location);
      } else {
        setGhlUser(null);
      }
    } catch {
      setGhlUser(null);
    } finally {
      setGhlUserLoading(false);
    }
  }, []);

  // GHL SSO: request encrypted user context from parent GHL window (marketplace app)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.message !== "REQUEST_USER_DATA_RESPONSE") return;
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeout);

      const encryptedData = event.data.payload;
      if (!encryptedData) return;

      try {
        const res = await fetch("/api/ghl/decrypt-sso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ encryptedData }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.user) {
          const userId = data.user.id ?? "";
          setGhlUser({
            id: userId,
            name: data.user.name,
            email: data.user.email,
            role: data.user.role,
          });
          if (data.user.activeLocation) {
            setGhlLocation({ id: data.user.activeLocation });
          }
          setGhlConnected(true);

          // Inject userId header into all /api/ fetch calls for this session
          if (userId) {
            sessionStorage.setItem("ghl-user-id", userId);
            const origFetch = window.fetch.bind(window);
            window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
              const url = typeof input === "string" ? input
                : input instanceof URL ? input.href
                : (input as Request).url;
              if (url.startsWith("/api/")) {
                const headers = new Headers(init?.headers);
                headers.set("x-ghl-user-id", userId);
                return origFetch(input, { ...init, headers });
              }
              return origFetch(input, init);
            };
          }
        }
      } catch { /* silent */ }
    };

    window.addEventListener("message", handleMessage);
    // Request user data from GHL parent
    window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
    // Clean up after 5s if no response (app running standalone)
    timeout = setTimeout(() => window.removeEventListener("message", handleMessage), 5000);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeout);
    };
  }, []);

  // Load app settings (GHL, CRM access)
  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(s => {
      if (s.ghlApiKey) setGhlApiKey(s.ghlApiKey);
      if (s.ghlLocationId) setGhlLocationId(s.ghlLocationId);
      setGhlConnected(!!s.ghlConnected);
      setCrmMemberAccess(!!s.crmMemberAccess);
      // Auto-fetch user context if already connected
      if (s.ghlConnected) fetchGhlUser();
    }).catch(() => {});
  }, [fetchGhlUser]);

  const handleSaveGhl = async () => {
    setGhlSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ghlApiKey, ghlLocationId }),
      });
      const data = await res.json();
      setGhlConnected(!!data.ghlConnected);
      if (data.ghlApiKey) setGhlApiKey(data.ghlApiKey);
      // Fetch user context after connecting
      if (data.ghlConnected) fetchGhlUser();
      else setGhlUser(null);
    } finally {
      setGhlSaving(false);
    }
  };

  const handleToggleCrmAccess = async (val: boolean) => {
    setCrmMemberAccess(val);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crmMemberAccess: val }),
    }).catch(() => {});
  };

  // Persist theme
  useEffect(() => {
    const saved = localStorage.getItem("ola-theme");
    if (saved === "dark") setIsDark(true);
  }, []);

  const toggleTheme = () => {
    setIsDark((v) => {
      localStorage.setItem("ola-theme", !v ? "dark" : "light");
      return !v;
    });
  };

  const computeStats = useCallback((list: EmailItem[]) => {
    setStats({
      totalEmails: list.length,
      contractsFound: list.filter((e) => e.analysis?.isContract).length,
      uploadedToGhl: list.filter((e) => e.ghlUpload?.uploaded).length,
      pendingAnalysis: list.filter((e) => !e.analysis).length,
    });
  }, []);

  const fetchEmails = useCallback(async (labelId?: string, refresh = false, days?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (labelId) p.set("label", labelId);
      if (refresh) p.set("refresh", "true");
      if (days) p.set("days", String(days));
      const res = await fetch(`/api/emails?${p}`);
      if (res.status === 401) { setIsConnected(false); return; }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur"); }
      const data = await res.json();
      setEmails(data.emails || []);
      computeStats(data.emails || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [computeStats]);

  const fetchLabels = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/labels");
      if (!res.ok) return;
      const data = await res.json();
      setLabels(data.labels || []);
    } catch { /* silent */ }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      if (!res.ok) return;
      const data = await res.json();
      setCustomTags(data.custom || []);
      setAllTags([...(data.predefined || []), ...(data.custom || [])]);
    } catch { /* silent */ }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) return;
      const data = await res.json();
      setRules(data.rules || []);
    } catch { /* silent */ }
  }, []);

  const initializeGmail = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/gmail?action=status");
      if (!res.ok) return;
      const { connected } = await res.json();
      if (!connected) return;
      setIsConnected(true);
      const savedDays = Number(localStorage.getItem("ola-sync-days") ?? "30");
      setSyncDays(savedDays);
      fetchLabels();
      fetchTags();
      fetchRules();
      fetchEmails(undefined, false, savedDays);
    } catch { /* silent */ }
  }, [fetchLabels, fetchTags, fetchRules, fetchEmails]);

  useEffect(() => {
    initializeGmail().finally(() => setCheckingAuth(false));
  }, [initializeGmail]);

  // Re-initialize after GHL SSO fires (fetch interceptor is now active with userId)
  useEffect(() => {
    if (!ghlUser?.id || isConnected) return;
    initializeGmail();
  }, [ghlUser?.id, isConnected, initializeGmail]);

  const handleSync = async () => {
    setIsSyncing(true);
    const labelId = sidebarFilter.type === "gmail-label" ? sidebarFilter.value : undefined;
    await fetchEmails(labelId, true, syncDays);
    setIsSyncing(false);
  };

  const handleReanalyzeAll = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/emails/analyze-all?force=true", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.changedEmails?.length) {
          setEmails((prev) => prev.map((e) => {
            const updated = data.changedEmails.find((u: EmailItem) => u.id === e.id);
            return updated ?? e;
          }));
        }
      }
    } catch { /* silent */ }
    finally { setIsSyncing(false); }
  };

  const handleSyncDaysChange = (days: number) => {
    setSyncDays(days);
    localStorage.setItem("ola-sync-days", String(days));
    setShowSyncSettings(false);
    fetchEmails(undefined, true, days);
  };

  const handleSidebarFilter = (filter: SidebarFilter) => {
    setSidebarFilter(filter);
    setSelectedEmail(null);
    if (filter.type === "gmail-label") {
      fetchEmails(filter.value, true, syncDays);
    } else if (filter.type === "all") {
      fetchEmails(undefined, false, syncDays);
    }
  };

  // ── Silent background polling (every 60s, checks last 2 days only) ─────
  const emailIdsRef = useRef<Set<string>>(new Set());
  const newEmailsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const poll = async () => {
      if (!isConnected) return;
      try {
        // Use days=2 for a lighter poll — only checks recent emails
        const res = await fetch("/api/emails?refresh=true&days=2");
        if (!res.ok) return;
        const data = await res.json();
        const fresh: EmailItem[] = data.emails || [];
        const currentIds = emailIdsRef.current;
        const brandNew = fresh.filter((e) => !currentIds.has(e.id));
        if (brandNew.length > 0) {
          setEmails((prev) => {
            const prevIds = new Set(prev.map((e) => e.id));
            const merged = [...brandNew.filter((e) => !prevIds.has(e.id)), ...prev];
            computeStats(merged);
            emailIdsRef.current = new Set(merged.map((e) => e.id));
            return merged;
          });
          // Show a brief notification that auto-clears after 4s
          setNewEmailsCount((n) => n + brandNew.length);
          if (newEmailsTimerRef.current) clearTimeout(newEmailsTimerRef.current);
          newEmailsTimerRef.current = setTimeout(() => setNewEmailsCount(0), 4000);
        }
      } catch { /* silent */ }
    };
    const id = setInterval(poll, 60_000);
    return () => { clearInterval(id); if (newEmailsTimerRef.current) clearTimeout(newEmailsTimerRef.current); };
  }, [isConnected, computeStats]);

  // Keep email ID set in sync when emails load normally
  useEffect(() => {
    emailIdsRef.current = new Set(emails.map((e) => e.id));
  }, [emails]);

  const handleTagsApplied = (emailId: string, tags: string[], category: string | null) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id !== emailId) return e;
        const merged = [...(e.tags ?? []), ...tags].filter((t, i, a) => a.indexOf(t) === i);
        return {
          ...e,
          tags: merged,
          aiTags: e.aiTags
            ? { ...e.aiTags, category: category ?? e.aiTags.category }
            : e.aiTags,
        };
      })
    );
    if (selectedEmail?.id === emailId) {
      setSelectedEmail((prev) => {
        if (!prev) return null;
        const merged = [...(prev.tags ?? []), ...tags].filter((t, i, a) => a.indexOf(t) === i);
        return {
          ...prev,
          tags: merged,
          aiTags: prev.aiTags
            ? { ...prev.aiTags, category: category ?? prev.aiTags.category }
            : prev.aiTags,
        };
      });
    }
  };

  const handleSetRead = (emailId: string, isRead: boolean) => {
    const update = (e: EmailItem) => e.id !== emailId ? e : { ...e, isRead };
    setEmails((prev) => prev.map(update));
    setSelectedEmail((prev) => (prev ? update(prev) : null));
    fetch(`/api/emails/${emailId}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead }),
    }).catch(() => {});
  };

  const handleMarkReplied = (emailId: string) => {
    const update = (e: EmailItem) =>
      e.id !== emailId ? e : { ...e, aiTags: e.aiTags ? { ...e.aiTags, needsReply: false } : e.aiTags };
    setEmails((prev) => prev.map(update));
    setSelectedEmail((prev) => (prev ? update(prev) : null));
  };

  const handleBodyLoaded = (
    emailId: string,
    body: string,
    bodyHtml: string | undefined,
    hasAttachment: boolean,
    attachments: EmailItem["attachments"]
  ) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === emailId
          ? { ...e, body, bodyHtml, hasAttachment, attachments }
          : e
      )
    );
    // Update selectedEmail in place so ContractCard re-uses cache next time
    setSelectedEmail((prev) =>
      prev && prev.id === emailId
        ? { ...prev, body, bodyHtml, hasAttachment, attachments }
        : prev
    );
  };

  const handleUpload = async (emailId: string, attachmentId: string, filename: string) => {
    setError(null);
    try {
      const res = await fetch("/api/ghl/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, attachmentId, filename }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur upload"); }
      const data = await res.json();
      setEmails((prev) =>
        prev.map((e) => (e.id === emailId ? { ...e, ghlUpload: data.ghlUpload } : e))
      );
      if (selectedEmail?.id === emailId) {
        setSelectedEmail((prev) => prev ? { ...prev, ghlUpload: data.ghlUpload } : null);
      }
      setEmails((prev) => { computeStats(prev); return prev; });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur upload");
    }
  };

  const handleEmailTagUpdate = (emailId: string, newTags: string[], newAiSuggestedTags?: string[]) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id !== emailId) return e;
        const updated = { ...e, tags: newTags };
        if (newAiSuggestedTags !== undefined && updated.aiTags) {
          updated.aiTags = { ...updated.aiTags, suggestedTags: newAiSuggestedTags };
        }
        return updated;
      })
    );
    if (selectedEmail?.id === emailId) {
      setSelectedEmail((prev) => {
        if (!prev) return null;
        const updated = { ...prev, tags: newTags };
        if (newAiSuggestedTags !== undefined && updated.aiTags) {
          updated.aiTags = { ...updated.aiTags, suggestedTags: newAiSuggestedTags };
        }
        return updated;
      });
    }
  };

  const handleContactLinked = (emailId: string, contact: LinkedContact | null) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, linkedContact: contact ?? undefined } : e))
    );
    if (selectedEmail?.id === emailId) {
      setSelectedEmail((prev) => prev ? { ...prev, linkedContact: contact ?? undefined } : null);
    }
  };

  const handleDisconnect = async () => {
    try { await fetch("/api/auth/gmail", { method: "DELETE" }); } finally { router.push("/"); }
  };

  // Count emails per tag (combined manual + ai suggested)
  const tagCounts = useCallback(
    (tagId: string) => emails.filter((e) => emailMatchesTag(e, tagId)).length,
    [emails]
  );

  // Real-estate sources for smart filter
  const REALESTATE_DOMAINS = ["immocontact", "centris", "duproprio", "ezmax", "authentisign", "kijiji", "remax", "royallepage", "century21", "via-capitale", "sutton"];
  const isRealEstateEmail = (e: EmailItem) =>
    (e.tags && e.tags.length > 0) ||
    (e.aiTags?.suggestedTags && e.aiTags.suggestedTags.length > 0) ||
    REALESTATE_DOMAINS.some((d) => e.from.toLowerCase().includes(d));

  // Real-estate category tags — emails with these are separated from inbox
  const CATEGORY_TAGS = ["visite", "lead", "client", "contrat", "offre", "signature", "inspection", "financement", "notaire"];
  const hasCategoryTag = (e: EmailItem) =>
    CATEGORY_TAGS.some((t) => emailMatchesTag(e, t)) || (e.analysis?.isContract ?? false);

  // A "contact request" = someone asking to be added (isDemandeInfo) OR category=client
  const isContactRequest = (e: EmailItem) =>
    e.analysis?.extractedContact?.isDemandeInfo === true ||
    e.aiTags?.category === "client" ||
    emailMatchesTag(e, "client");

  const isImmocontact = (e: EmailItem) => e.from.toLowerCase().includes("immocontact");
  const isCentris = (e: EmailItem) => e.from.toLowerCase().includes("centris");

  // Filter logic
  // Build unique clients list from email senders, sorted by email count desc
  const clients = (() => {
    const map = new Map<string, { name: string; email: string; count: number }>();
    for (const e of emails) {
      const { name, email } = parseSender(e.from);
      if (!email) continue;
      const existing = map.get(email);
      if (existing) { existing.count++; if (!existing.name && name) existing.name = name; }
      else map.set(email, { name, email, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  })();

  const filteredEmails = emails.filter((e) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchFrom = e.from.toLowerCase().includes(q);
      const matchSubject = e.subject.toLowerCase().includes(q);
      const matchSnippet = e.snippet.toLowerCase().includes(q);
      if (!matchFrom && !matchSubject && !matchSnippet) return false;
    }
    // Smart filter
    if (smartFilter && !isRealEstateEmail(e)) return false;
    // Sidebar filter
    if (sidebarFilter.type === "tag") {
      if (!emailMatchesTag(e, sidebarFilter.value)) return false;
    }
    if (sidebarFilter.type === "needs-reply") {
      if (!e.aiTags?.needsReply) return false;
    }
    if (sidebarFilter.type === "urgent-filter") {
      if (e.aiTags?.urgency !== "urgent") return false;
    }
    if (sidebarFilter.type === "contact") {
      if (parseSender(e.from).email !== sidebarFilter.value) return false;
    }
    // Unread filter
    if (unreadOnly && e.isRead) return false;
    // Tab filter
    if (activeTab === "actions") return e.aiTags?.needsReply === true;
    if (activeTab === "inbox") return !hasCategoryTag(e);
    if (activeTab === "visites") return emailMatchesTag(e, "visite");
    if (activeTab === "leads") return isContactRequest(e);
    if (activeTab === "contrats") return emailMatchesTag(e, "contrat") || (e.analysis?.isContract ?? false);
    if (activeTab === "immocontact") return isImmocontact(e);
    if (activeTab === "centris") return isCentris(e);
    // "all" — no extra filter
    return true;
  });

  // Sort "À faire" by urgency: urgent first
  const urgencyOrder = { urgent: 0, normal: 1, low: 2 };
  const displayEmails = activeTab === "actions"
    ? [...filteredEmails].sort((a, b) =>
        (urgencyOrder[a.aiTags?.urgency ?? "normal"] ?? 1) - (urgencyOrder[b.aiTags?.urgency ?? "normal"] ?? 1)
      )
    : filteredEmails;

  const handleMarkAllRead = async () => {
    const targets = displayEmails.filter((e) => !e.isRead);
    targets.forEach((e) => handleSetRead(e.id, true));
  };

  const handleSent = (emailId: string) => {
    const idx = displayEmails.findIndex((e) => e.id === emailId);
    const next = filteredEmails[idx + 1] ?? filteredEmails[idx - 1] ?? null;
    setSelectedEmail(next);
  };

  const handleQuickAddContact = async (email: EmailItem) => {
    const ec = email.analysis?.extractedContact;
    if (!ec) return;
    const nameParts = (ec.name ?? "").trim().split(/\s+/);
    try {
      const res = await fetch("/api/ghl/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: nameParts[0] ?? "",
          lastName: nameParts.slice(1).join(" ") ?? "",
          name: ec.name ?? "",
          email: ec.email ?? "",
          phone: ec.phone ?? "",
          tags: ["lead"],
        }),
      });
      const data = await res.json();
      if (res.ok && data.contact) {
        const linked = { id: data.contact.id, name: data.contact.name ?? ec.name ?? "", email: data.contact.email ?? ec.email, phone: data.contact.phone ?? ec.phone };
        await fetch(`/api/emails/${email.id}/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact: linked }),
        });
        handleContactLinked(email.id, linked);
      }
    } catch { /* silent */ }
  };

  const handleSectionDrop = (targetId: "gmail" | "clients") => {
    const dragId = dragSectionRef.current as "gmail" | "clients" | null;
    if (!dragId || dragId === targetId) { setDragOverSection(null); return; }
    setSidebarSectionOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(dragId);
      const toIdx = next.indexOf(targetId);
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      localStorage.setItem("ola-section-order", JSON.stringify(next));
      return next;
    });
    setDragOverSection(null);
  };

  const sidebarTitle = (() => {
    if (sidebarFilter.type === "all") return "Boîte de réception";
    if (sidebarFilter.type === "needs-reply") return "Action requise";
    if (sidebarFilter.type === "urgent-filter") return "Urgent";
    if (sidebarFilter.type === "tag") {
      const tag = allTags.find((t) => t.id === sidebarFilter.value);
      return tag?.name ?? sidebarFilter.value;
    }
    if (sidebarFilter.type === "gmail-label") {
      return labels.find((l) => l.id === sidebarFilter.value)?.name ?? "Dossier";
    }
    if (sidebarFilter.type === "contact") {
      const c = clients.find((c) => c.email === sidebarFilter.value);
      return c?.name || sidebarFilter.value;
    }
    return "Boîte de réception";
  })();

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (checkingAuth) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <RefreshCw className="w-5 h-5 text-[#9aa0a6] animate-spin" />
    </div>
  );
  if (!isConnected) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <p className="text-sm text-[#5f6368]">Non connecté à Gmail</p>
      <ConnectGmail ghlUserId={ghlUser?.id} />
    </div>
  );

  const userLabels = labels.filter((l) => l.type === "user");

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div className={`h-screen flex flex-col overflow-hidden font-sans ${isDark ? "dark" : ""}`}>
      <div className="h-full flex flex-col bg-white dark:bg-[#202124] text-[#202124] dark:text-[#e8eaed]">

        {/* ══ Top bar ══ */}
        <div className="flex items-center gap-2 px-3 h-[56px] flex-shrink-0 bg-white dark:bg-[#202124] border-b border-[#e0e0e0] dark:border-[#3c4043]">
          <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors flex-shrink-0">
            <Menu className="w-5 h-5 text-[#5f6368] dark:text-[#9aa0a6]" />
          </button>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#e8f0fe] dark:bg-[#1a2744] text-[#1a73e8] dark:text-[#a8c7fa] tracking-wide flex-shrink-0">
            BETA
          </span>

          <div className="flex-1 max-w-[640px]">
            <div className={`flex items-center gap-3 rounded-2xl px-4 py-2 transition-colors
              ${searchFocused
                ? "bg-white dark:bg-[#202124] shadow-md border border-[#e0e0e0] dark:border-[#3c4043]"
                : "bg-[#f1f3f4] dark:bg-[#303134] hover:bg-[#e8eaed] dark:hover:bg-[#3c3f43]"
              }`}>
              <Search className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6] flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Rechercher dans les emails…"
                className="flex-1 text-[14px] bg-transparent text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-[#9aa0a6] hover:text-[#5f6368] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 ml-auto">
            {/* Sync settings */}
            <div className="relative" ref={syncSettingsRef}>
              <button
                onClick={() => setShowSyncSettings((v) => !v)}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
                title="Paramètres de synchronisation"
              >
                <SlidersHorizontal className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6]" />
              </button>
              {showSyncSettings && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#2d2e30] border border-[#e0e0e0] dark:border-[#3c4043] rounded-xl shadow-xl min-w-[220px] p-3">
                  <p className="text-[12px] font-semibold text-[#5f6368] dark:text-[#9aa0a6] mb-2 uppercase tracking-wide">Synchroniser les {syncDays} derniers jours</p>
                  <div className="flex flex-col gap-1">
                    {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                      <button
                        key={d}
                        onClick={() => handleSyncDaysChange(d)}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-[13px] transition-colors text-left
                          ${syncDays === d
                            ? "bg-[#e8f0fe] dark:bg-[#1a2744] text-[#1a73e8] dark:text-[#a8c7fa] font-medium"
                            : "text-[#202124] dark:text-[#e8eaed] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043]"
                          }`}
                      >
                        {d} jours
                        {syncDays === d && <span className="text-[10px]">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Language toggle */}
            <button
              onClick={() => setLang((l) => {
                const next: Lang = l === "fr" ? "en" : "fr";
                localStorage.setItem("ola-lang", next);
                return next;
              })}
              className="h-7 px-2.5 rounded-full border border-[#e0e0e0] dark:border-[#3c4043] text-[12px] font-semibold text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
              title="Changer de langue / Switch language"
            >
              {lang === "fr" ? "EN" : "FR"}
            </button>

            {/* Settings panel */}
            <div className="relative" ref={settingsPanelRef}>
              <div className="relative inline-flex">
                <button
                  onClick={() => setShowSettingsPanel((v) => !v)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors overflow-hidden ${showSettingsPanel ? "ring-2 ring-[#1a73e8] ring-offset-1" : "hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043]"}`}
                  title={ghlUser ? `${ghlUser.name ?? "Utilisateur GHL"} · Réglages` : "Réglages"}
                >
                  {ghlUser ? (
                    ghlUser.profilePhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ghlUser.profilePhoto} alt={ghlUser.name ?? ""} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-[#1a73e8] flex items-center justify-center">
                        <span className="text-white text-[13px] font-semibold">
                          {(ghlUser.firstName?.[0] ?? ghlUser.name?.[0] ?? "G").toUpperCase()}
                        </span>
                      </div>
                    )
                  ) : (
                    <Settings className={`w-4 h-4 ${showSettingsPanel ? "text-[#1a73e8] dark:text-[#a8c7fa]" : "text-[#5f6368] dark:text-[#9aa0a6]"}`} />
                  )}
                </button>
                {/* GHL connection status dot */}
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#202124] ${ghlConnected ? "bg-[#34a853]" : "bg-[#dadce0] dark:bg-[#5f6368]"}`} />
              </div>
              {showSettingsPanel && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#2d2e30] border border-[#e0e0e0] dark:border-[#3c4043] rounded-2xl shadow-xl w-[300px] p-4 flex flex-col gap-4">
                  <p className="text-[13px] font-semibold text-[#202124] dark:text-[#e8eaed]">Réglages</p>

                  {/* Rédaction */}
                  <div className="flex flex-col gap-3">
                    {/* Rédaction section */}
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9aa0a6]">Rédaction</p>

                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <p className="text-[13px] text-[#202124] dark:text-[#e8eaed]">Brander les courriels auto.</p>
                        <p className="text-[11px] text-[#9aa0a6]">Ajouter ta marque à chaque réponse IA</p>
                      </div>
                      <button
                        onClick={() => setAutoBrand((v) => { const next = !v; localStorage.setItem("ola-auto-brand", String(next)); return next; })}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${autoBrand ? "bg-[#1a73e8]" : "bg-[#dadce0] dark:bg-[#5f6368]"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoBrand ? "translate-x-[20px]" : "translate-x-0"}`} />
                      </button>
                    </label>

                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <p className="text-[13px] text-[#202124] dark:text-[#e8eaed]">Signature automatique</p>
                        <p className="text-[11px] text-[#9aa0a6]">Ajouter ta signature en bas de chaque email</p>
                      </div>
                      <button
                        onClick={() => setAutoSignature((v) => { const next = !v; localStorage.setItem("ola-auto-signature", String(next)); return next; })}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${autoSignature ? "bg-[#1a73e8]" : "bg-[#dadce0] dark:bg-[#5f6368]"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoSignature ? "translate-x-[20px]" : "translate-x-0"}`} />
                      </button>
                    </label>

                    {autoSignature && (
                      <textarea
                        value={signatureText}
                        onChange={(e) => { setSignatureText(e.target.value); localStorage.setItem("ola-signature-text", e.target.value); }}
                        placeholder={"Cordialement,\nJean Tremblay\nAgent immobilier — 514-555-0000"}
                        rows={3}
                        className="w-full text-[12px] px-3 py-2 rounded-xl border border-[#e0e0e0] dark:border-[#3c4043] bg-[#f8f9fa] dark:bg-[#202124] text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none resize-none leading-relaxed"
                      />
                    )}
                  </div>

                  {/* GoHighLevel section */}
                  <div className="border-t border-[#e0e0e0] dark:border-[#3c4043] pt-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9aa0a6]">GoHighLevel</p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ghlConnected ? "bg-[#e6f4ea] text-[#137333] dark:bg-[#1e3a2a] dark:text-[#81c995]" : "bg-[#fce8e6] text-[#c5221f] dark:bg-[#3b1f1e] dark:text-[#f28b82]"}`}>
                        {ghlConnected ? "Connecté" : "Non connecté"}
                      </span>
                    </div>

                    {/* GHL User Profile Card */}
                    {ghlConnected && (
                      <div className="rounded-xl border border-[#e0e0e0] dark:border-[#3c4043] bg-[#f8f9fa] dark:bg-[#202124] p-3">
                        {ghlUserLoading ? (
                          <div className="flex items-center gap-2 text-[12px] text-[#9aa0a6]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Chargement du profil…
                          </div>
                        ) : ghlUser ? (
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-[#1a73e8] flex items-center justify-center">
                              {ghlUser.profilePhoto ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={ghlUser.profilePhoto} alt={ghlUser.name ?? ""} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-white text-[13px] font-semibold">
                                  {(ghlUser.firstName?.[0] ?? ghlUser.name?.[0] ?? "U").toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#202124] dark:text-[#e8eaed] truncate">
                                {ghlUser.name || `${ghlUser.firstName ?? ""} ${ghlUser.lastName ?? ""}`.trim() || "Utilisateur GHL"}
                              </p>
                              {ghlUser.email && (
                                <p className="text-[11px] text-[#9aa0a6] truncate">{ghlUser.email}</p>
                              )}
                              {(ghlUser.role || ghlLocation?.name) && (
                                <p className="text-[11px] text-[#1a73e8] dark:text-[#a8c7fa] truncate">
                                  {ghlUser.role === "admin" ? "Admin" : ghlUser.role === "user" ? "Membre" : ghlUser.role ?? ""}
                                  {ghlUser.role && ghlLocation?.name ? " · " : ""}
                                  {ghlLocation?.name ?? ""}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={fetchGhlUser}
                              title="Rafraîchir le profil"
                              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#e0e0e0] dark:hover:bg-[#3c4043] transition-colors flex-shrink-0"
                            >
                              <RefreshCw className="w-3 h-3 text-[#9aa0a6]" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] text-[#9aa0a6]">Profil non chargé</p>
                            <button
                              onClick={fetchGhlUser}
                              className="text-[12px] text-[#1a73e8] dark:text-[#a8c7fa] hover:underline"
                            >
                              Réessayer
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <input
                        type="password"
                        value={ghlApiKey}
                        onChange={(e) => setGhlApiKey(e.target.value)}
                        placeholder="Clé API GHL (Bearer token)"
                        className="w-full text-[12px] px-3 py-2 rounded-xl border border-[#e0e0e0] dark:border-[#3c4043] bg-[#f8f9fa] dark:bg-[#202124] text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none"
                      />
                      <input
                        type="text"
                        value={ghlLocationId}
                        onChange={(e) => setGhlLocationId(e.target.value)}
                        placeholder="Location ID"
                        className="w-full text-[12px] px-3 py-2 rounded-xl border border-[#e0e0e0] dark:border-[#3c4043] bg-[#f8f9fa] dark:bg-[#202124] text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6] outline-none"
                      />
                      <button
                        onClick={handleSaveGhl}
                        disabled={ghlSaving}
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white text-[12px] font-medium transition-colors"
                      >
                        {ghlSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {ghlSaving ? "Sauvegarde…" : "Sauvegarder la connexion"}
                      </button>
                    </div>

                    {/* CRM member access */}
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <p className="text-[13px] text-[#202124] dark:text-[#e8eaed]">Accès membres du CRM</p>
                        <p className="text-[11px] text-[#9aa0a6]">Partager les données avec tous les membres de la location</p>
                      </div>
                      <button
                        onClick={() => handleToggleCrmAccess(!crmMemberAccess)}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${crmMemberAccess ? "bg-[#1a73e8]" : "bg-[#dadce0] dark:bg-[#5f6368]"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${crmMemberAccess ? "translate-x-[20px]" : "translate-x-0"}`} />
                      </button>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <button onClick={toggleTheme}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
              title={isDark ? "Mode clair" : "Mode sombre"}>
              {isDark
                ? <Sun className="w-4 h-4 text-[#9aa0a6]" />
                : <Moon className="w-4 h-4 text-[#5f6368]" />}
            </button>
            <button onClick={handleDisconnect}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
              title={t("disconnect")}>
              <LogOut className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6]" />
            </button>
          </div>
        </div>

        {/* ══ Error banner ══ */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[#fce8e6] dark:bg-[#3b1f1e] border-b border-[#f28b82] dark:border-[#5c3030] text-[13px] text-[#c5221f] dark:text-[#f28b82] flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-[#c5221f] dark:text-[#f28b82] hover:opacity-70 font-bold text-base">×</button>
          </div>
        )}

        {/* ══ Body ══ */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar ── */}
          <div className="w-[256px] flex-shrink-0 py-2 flex flex-col overflow-y-auto">

            {/* Compose button */}
            <div className="px-3 mb-3">
              <button
                onClick={() => { setShowComposeFreeform(true); setSelectedEmail(null); }}
                className="flex items-center gap-3 w-full pl-4 pr-5 py-3 rounded-2xl bg-[#e8f0fe] dark:bg-[#1a2744] hover:bg-[#d3e3fd] dark:hover:bg-[#1e2f55] text-[#1a73e8] dark:text-[#a8c7fa] text-[14px] font-medium transition-all shadow-sm hover:shadow"
              >
                <div className="w-8 h-8 rounded-full bg-[#1a73e8] dark:bg-[#a8c7fa] flex items-center justify-center flex-shrink-0">
                  <Plus className="w-4 h-4 text-white dark:text-[#062e6f]" />
                </div>
                Nouveau message
              </button>
            </div>

            {/* Navigation section */}
            <nav className="mt-1 px-1">
              <SidebarItem
                label={t("inbox")}
                icon={<Inbox className="w-5 h-5" />}
                count={stats.pendingAnalysis > 0 ? stats.pendingAnalysis : undefined}
                active={sidebarFilter.type === "all"}
                onClick={() => { handleSidebarFilter({ type: "all" }); setActiveTab("all"); }}
              />
              {/* Urgent — filtre par urgency="urgent" */}
              <SidebarItem
                label={t("urgent")}
                icon={<AlertCircle className="w-5 h-5" />}
                count={emails.filter(e => e.aiTags?.urgency === "urgent").length || undefined}
                active={sidebarFilter.type === "urgent-filter"}
                onClick={() => { handleSidebarFilter({ type: "urgent-filter" }); setActiveTab("all"); }}
              />
              {/* Action requise — filtre par needsReply */}
              <SidebarItem
                label={t("action-required")}
                icon={<Zap className="w-5 h-5" />}
                count={emails.filter(e => e.aiTags?.needsReply).length || undefined}
                active={sidebarFilter.type === "needs-reply"}
                onClick={() => { handleSidebarFilter({ type: "needs-reply" }); setActiveTab("all"); }}
              />
              {/* À lire — filtre par tag fyi */}
              <SidebarItem
                label={t("fyi")}
                icon={<Eye className="w-5 h-5" />}
                count={tagCounts("fyi") || undefined}
                active={sidebarFilter.type === "tag" && sidebarFilter.value === "fyi"}
                onClick={() => { handleSidebarFilter({ type: "tag", value: "fyi" }); setActiveTab("all"); }}
              />
            </nav>

            {/* Draggable sections: Gmail + Clients */}
            {sidebarSectionOrder.map((sectionId) => {
              if (sectionId === "gmail" && userLabels.length > 0) return (
                <div
                  key="gmail"
                  draggable
                  onDragStart={() => { dragSectionRef.current = "gmail"; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverSection("gmail"); }}
                  onDragLeave={() => setDragOverSection(null)}
                  onDrop={() => handleSectionDrop("gmail")}
                  className={`mt-2 rounded-lg transition-colors ${dragOverSection === "gmail" ? "bg-[#e8f0fe] dark:bg-[#1a2744]" : ""}`}
                >
                  <button
                    onClick={() => setLabelsExpanded((v) => !v)}
                    className="flex items-center gap-1 px-2 py-1 text-[13px] font-medium text-[#444746] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] transition-colors w-full"
                  >
                    <GripVertical className="w-3.5 h-3.5 text-[#c4c7c5] dark:text-[#5f6368] cursor-grab flex-shrink-0" />
                    {labelsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {t("gmailFolders")}
                  </button>
                  {labelsExpanded && (
                    <div className="mt-0.5 px-1">
                      {(showAllLabels ? userLabels : userLabels.slice(0, 15)).map((label) => (
                        <SidebarItem
                          key={label.id}
                          label={label.name}
                          icon={<Tag className="w-4 h-4" />}
                          active={sidebarFilter.type === "gmail-label" && sidebarFilter.value === label.id}
                          onClick={() => { handleSidebarFilter({ type: "gmail-label", value: label.id }); setActiveTab("all"); }}
                        />
                      ))}
                      {userLabels.length > 15 && (
                        <button
                          onClick={() => setShowAllLabels((v) => !v)}
                          className="flex items-center gap-3 px-4 py-2 w-full text-[13px] text-[#1a73e8] dark:text-[#a8c7fa] hover:bg-[#e8f0fe] dark:hover:bg-[#1a2744] rounded-r-full transition-colors"
                        >
                          {showAllLabels ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          {showAllLabels ? "Voir moins" : `${userLabels.length - 15} dossiers de plus`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );

              if (sectionId === "clients" && clients.length > 0) return (
                <div
                  key="clients"
                  draggable
                  onDragStart={() => { dragSectionRef.current = "clients"; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverSection("clients"); }}
                  onDragLeave={() => setDragOverSection(null)}
                  onDrop={() => handleSectionDrop("clients")}
                  className={`mt-4 rounded-lg transition-colors ${dragOverSection === "clients" ? "bg-[#e8f0fe] dark:bg-[#1a2744]" : ""}`}
                >
                  <div className="flex items-center gap-1 px-2 mb-1.5">
                    <GripVertical className="w-3.5 h-3.5 text-[#c4c7c5] dark:text-[#5f6368] cursor-grab flex-shrink-0" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9aa0a6] dark:text-[#5f6368]">Clients</p>
                  </div>
                  <div className="px-3 mb-1">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f1f3f4] dark:bg-[#3c4043]">
                      <Search className="w-3.5 h-3.5 text-[#9aa0a6] flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Rechercher un client…"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        className="flex-1 text-[12px] bg-transparent outline-none text-[#202124] dark:text-[#e8eaed] placeholder-[#9aa0a6]"
                      />
                      {clientSearch && (
                        <button onClick={() => setClientSearch("")} className="text-[#9aa0a6] hover:text-[#5f6368]">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="px-1">
                    {clients
                      .filter((c) => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.email.includes(clientSearch.toLowerCase()))
                      .map((c) => (
                        <SidebarItem
                          key={c.email}
                          label={c.name || c.email}
                          icon={<Users className="w-4 h-4" />}
                          count={c.count > 1 ? c.count : undefined}
                          active={sidebarFilter.type === "contact" && sidebarFilter.value === c.email}
                          onClick={() => { handleSidebarFilter({ type: "contact", value: c.email }); setActiveTab("all"); }}
                        />
                      ))}
                  </div>
                </div>
              );

              return null;
            })}

          </div>

          {/* ── Email list — hidden while reading or composing except on visites tab ── */}
          {(!selectedEmail && !showComposeFreeform || activeTab === "visites") && (
            <div className={`${selectedEmail && activeTab === "visites" ? "w-[300px] flex-shrink-0" : "flex-1"} min-w-0 flex flex-col border-l border-[#e0e0e0] dark:border-[#3c4043]`}>
              {/* New emails toast (auto-dismisses) */}
              {newEmailsCount > 0 && (
                <div className="flex items-center justify-center gap-2 py-1.5 text-[12px] font-medium text-white bg-[#1a73e8] flex-shrink-0 animate-pulse">
                  <RefreshCw className="w-3 h-3" />
                  {newEmailsCount} nouveau{newEmailsCount > 1 ? "x" : ""} email{newEmailsCount > 1 ? "s" : ""} ajouté{newEmailsCount > 1 ? "s" : ""}
                </div>
              )}
              {/* List toolbar */}
              <div className="flex-shrink-0 border-b border-[#e0e0e0] dark:border-[#3c4043]">
                {/* Category tabs */}
                <div className="flex items-center gap-1 px-3 pt-2 pb-0 overflow-x-auto">
                  {([
                    { key: "actions",     label: "⚡ À faire",   count: emails.filter(e => e.aiTags?.needsReply).length },
                    { key: "inbox",       label: "Boîte",       count: emails.filter(e => !hasCategoryTag(e)).length },
                    { key: "immocontact", label: "Immocontact", count: emails.filter(e => isImmocontact(e)).length },
                    { key: "centris",     label: "Centris",     count: emails.filter(e => isCentris(e)).length },
                    { key: "leads",       label: "Contacts",    count: emails.filter(e => isContactRequest(e)).length },
                    { key: "contrats",    label: "Contrats",    count: emails.filter(e => emailMatchesTag(e, "contrat") || (e.analysis?.isContract ?? false)).length },
                    { key: "all",         label: "Tous",        count: emails.length },
                  ] as const).map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key); setSelectedEmail(null); }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                          isActive
                            ? "border-[#0b57d0] dark:border-[#a8c7fa] text-[#0b57d0] dark:text-[#a8c7fa] bg-[#f8f9ff] dark:bg-[#1a2233]"
                            : "border-transparent text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30]"
                        }`}
                      >
                        {tab.label}
                        {tab.count > 0 && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                            isActive
                              ? "bg-[#d3e3fd] dark:bg-[#1a2744] text-[#0b57d0] dark:text-[#a8c7fa]"
                              : "bg-[#f1f3f4] dark:bg-[#3c4043] text-[#5f6368] dark:text-[#9aa0a6]"
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Secondary toolbar */}
                <div className="flex items-center h-[38px] px-4 gap-2">
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    title="Actualiser les emails depuis Gmail"
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] text-[#5f6368] dark:text-[#9aa0a6] transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={handleReanalyzeAll}
                    disabled={isSyncing}
                    title="Re-analyser tous les emails avec l'IA"
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] text-[#5f6368] dark:text-[#9aa0a6] transition-colors disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-4 bg-[#e0e0e0] dark:bg-[#3c4043]" />
                  <button
                    onClick={() => setUnreadOnly((v) => !v)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                      unreadOnly
                        ? "bg-[#d3e3fd] dark:bg-[#394457] text-[#0b57d0] dark:text-[#a8c7fa] font-medium"
                        : "text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] border border-[#e0e0e0] dark:border-[#3c4043]"
                    }`}
                  >
                    Non lus{unreadOnly && emails.filter(e => !e.isRead).length > 0 ? ` (${emails.filter(e => !e.isRead).length})` : ""}
                  </button>
                  {activeTab === "all" && (
                    <button
                      onClick={() => setSmartFilter((v) => !v)}
                      className={`flex-shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        smartFilter
                          ? "bg-[#e8f0fe] dark:bg-[#1a2744] text-[#1a73e8] dark:text-[#a8c7fa] border-[#a8c7fa] dark:border-[#1a4a8a]"
                          : "border-[#e0e0e0] dark:border-[#3c4043] text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30]"
                      }`}
                    >
                      {smartFilter ? "🏠 Immo" : "Tous"}
                    </button>
                  )}
                  {(activeTab === "immocontact" || activeTab === "centris" || activeTab === "all") && displayEmails.some(e => !e.isRead) && (
                    <button
                      onClick={handleMarkAllRead}
                      className="ml-auto flex-shrink-0 text-[11px] text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] px-2.5 py-1 rounded-full border border-[#e0e0e0] dark:border-[#3c4043] transition-colors"
                    >
                      Tout marquer lu
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-5 h-5 text-[#9aa0a6] animate-spin" />
                  <p className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">Chargement…</p>
                </div>
              ) : activeTab === "visites" ? (
                <VisitesCalendar
                  emails={displayEmails}
                  onSelect={(e) => { setSelectedEmail(e); if (!e.isRead) handleSetRead(e.id, true); }}
                  selectedId={selectedEmail?.id}
                  isDark={isDark}
                />
              ) : displayEmails.length === 0 ? (
                <div className="flex-1 overflow-y-auto">
                  {activeTab === "actions" ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                      <span className="text-4xl">✅</span>
                      <p className="text-[15px] font-medium text-[#202124] dark:text-[#e8eaed]">Tout est réglé !</p>
                      <p className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">Aucun email n&apos;attend ta réponse.</p>
                    </div>
                  ) : (
                    <EmptyState
                      labels={userLabels}
                      onSelect={(id) => { handleSidebarFilter({ type: "gmail-label", value: id }); setActiveTab("all"); }}
                      hasEmails={emails.length > 0}
                    />
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <EmailList
                    emails={displayEmails}
                    selectedId={undefined}
                    onSelect={(e) => { setSelectedEmail(e); if (!e.isRead) handleSetRead(e.id, true); }}
                    allTags={allTags}
                    showAddContact={activeTab === "leads"}
                    onQuickAddContact={handleQuickAddContact}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Compose pane ── */}
          {showComposeFreeform && !selectedEmail && (
            <div className="flex-1 border-l border-[#e0e0e0] dark:border-[#3c4043] overflow-hidden flex flex-col">
              <ComposePanel onClose={() => setShowComposeFreeform(false)} />
            </div>
          )}

          {/* ── Reading pane — full width when open ── */}
          {selectedEmail && (() => {
            const idx = displayEmails.findIndex((e) => e.id === selectedEmail.id);
            const prev = idx > 0 ? displayEmails[idx - 1] : null;
            const next = idx < displayEmails.length - 1 ? displayEmails[idx + 1] : null;
            const navigate = (email: EmailItem) => { setSelectedEmail(email); if (!email.isRead) handleSetRead(email.id, true); };
            return (
            <div className="flex-1 border-l border-[#e0e0e0] dark:border-[#3c4043] overflow-hidden flex flex-col">
              <ContractCard
                email={selectedEmail}
                onUpload={handleUpload}
                allTags={allTags}
                onTagsChange={handleEmailTagUpdate}
                onContactLinked={handleContactLinked}
                onTagsApplied={handleTagsApplied}
                onMarkReplied={handleMarkReplied}
                onSetRead={(id, isRead) => handleSetRead(id, isRead)}
                onClose={() => setSelectedEmail(null)}
                onSent={handleSent}
                onBodyLoaded={handleBodyLoaded}
                onPrev={prev ? () => navigate(prev) : undefined}
                onNext={next ? () => navigate(next) : undefined}
                emailIndex={idx}
                emailTotal={filteredEmails.length}
                ghlUserId={ghlUser?.id}
              />
            </div>
            );
          })()}
        </div>
      </div>

      {/* Modals */}
      {showRulesModal && (
        <RulesModal
          rules={rules}
          allTags={allTags}
          onClose={() => setShowRulesModal(false)}
          onRulesChange={setRules}
        />
      )}
      {showCreateTagModal && (
        <CreateTagModal
          onClose={() => setShowCreateTagModal(false)}
          onCreated={(tag) => {
            setCustomTags((prev) => [...prev, tag]);
            setAllTags((prev) => [...prev, tag]);
            setShowCreateTagModal(false);
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SidebarItem({
  icon, label, count, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-4 pl-6 pr-4 py-1 w-full rounded-r-full text-[14px] transition-colors text-left
        ${active
          ? "bg-[#d3e3fd] dark:bg-[#394457] text-[#202124] dark:text-[#e8eaed] font-semibold"
          : "text-[#202124] dark:text-[#e8eaed] hover:bg-[#e8eaed] dark:hover:bg-[#3c4043] font-normal"
        }`}
      style={{ height: 32 }}
    >
      <span className={active ? "text-[#202124] dark:text-[#e8eaed]" : "text-[#444746] dark:text-[#9aa0a6]"}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-[12px] font-semibold flex-shrink-0 text-[#202124] dark:text-[#e8eaed]">
          {count}
        </span>
      )}
    </button>
  );
}

function EmptyState({
  labels, onSelect, hasEmails,
}: {
  labels: GmailLabel[];
  onSelect: (id: string) => void;
  hasEmails: boolean;
}) {
  if (hasEmails) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
        <p className="text-[14px] text-[#5f6368] dark:text-[#9aa0a6]">Aucun email dans cette catégorie</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <Inbox className="w-12 h-12 text-[#e0e0e0] dark:text-[#3c4043]" />
      <div>
        <p className="text-[14px] font-medium text-[#202124] dark:text-[#e8eaed] mb-1">
          {labels.length > 0 ? "Choisissez un dossier" : "Cliquez sur Synchroniser"}
        </p>
        <p className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">
          {labels.length > 0
            ? "ou cliquez sur Synchroniser pour charger les emails"
            : "pour récupérer vos emails Gmail"}
        </p>
      </div>
      {labels.length > 0 && (
        <div className="flex flex-col gap-1 w-full max-w-[200px]">
          {labels.slice(0, 6).map((l) => (
            <button
              key={l.id}
              onClick={() => onSelect(l.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] hover:text-[#202124] dark:hover:text-[#e8eaed] transition-colors text-left"
            >
              <FolderOpen className="w-4 h-4 flex-shrink-0" />
              {l.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
