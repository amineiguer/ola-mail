"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Search, Settings, X,
} from "lucide-react";
import EmailList from "@/components/EmailList";
import ContractCard from "@/components/ContractCard";
import VisitesCalendar from "@/components/VisitesCalendar";
import ConnectGmail from "@/components/ConnectGmail";
import ConnectOutlook from "@/components/ConnectOutlook";
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
  | { type: "action" }
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
  { id: "urgent",          label: "Urgent" },
  { id: "action-required", label: "Action requise" },
  { id: "fyi",             label: "A lire" },
];

const REALESTATE_NAV = [
  { id: "lead",        label: "Lead" },
  { id: "client",      label: "Client" },
  { id: "contrat",     label: "Contrat" },
  { id: "visite",      label: "Visite" },
  { id: "offre",       label: "Offre d'achat" },
  { id: "signature",   label: "Signature" },
  { id: "inspection",  label: "Inspection" },
  { id: "financement", label: "Financement" },
  { id: "notaire",     label: "Notaire" },
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
  const [isOutlookConnected, setIsOutlookConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | undefined>();
  const [outlookEmail, setOutlookEmail] = useState<string | undefined>();
  const [activeProviderFilter, setActiveProviderFilter] = useState<"all" | "gmail" | "outlook">("all");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [mesEtiquettesExpanded, setMesEtiquettesExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"inbox" | "all" | "visites">("all");
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
  const ghlSsoInitializedRef = useRef(false);
  const intentionalDisconnectRef = useRef(false);
  const emailsLoadedRef = useRef(false);

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

  const fetchEmails = useCallback(async (labelId?: string, refresh = false, days?: number, providerFilter?: "all" | "gmail" | "outlook") => {
    setIsLoading(true);
    setError(null);
    try {
      const filter = providerFilter ?? activeProviderFilter;

      const gmailPromise = filter !== "outlook" ? (async () => {
        const p = new URLSearchParams();
        if (labelId) p.set("label", labelId);
        if (refresh) p.set("refresh", "true");
        if (days) p.set("days", String(days));
        const res = await fetch(`/api/emails?${p}`);
        if (res.status === 401) { setIsConnected(false); return []; }
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur Gmail"); }
        const data = await res.json();
        return (data.emails || []) as EmailItem[];
      })() : Promise.resolve([] as EmailItem[]);

      const outlookPromise = filter !== "gmail" ? (async () => {
        const p = new URLSearchParams();
        if (days) p.set("days", String(days));
        const res = await fetch(`/api/emails/outlook?${p}`);
        if (res.status === 401 || res.status === 400) return [];
        if (!res.ok) return [];
        const data = await res.json();
        return (data.emails || []) as EmailItem[];
      })() : Promise.resolve([] as EmailItem[]);

      const [gmailEmails, outlookEmails] = await Promise.all([gmailPromise, outlookPromise]);
      const allEmails = [...(gmailEmails ?? []), ...outlookEmails].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setEmails(allEmails);
      computeStats(allEmails);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [computeStats, activeProviderFilter]);

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
    // Reset intentional disconnect flag so future reconnects work
    intentionalDisconnectRef.current = false;
    try {
      const [gmailRes, outlookRes] = await Promise.all([
        fetch("/api/auth/gmail?action=status"),
        fetch("/api/auth/outlook?action=status"),
      ]);

      const gmailData = gmailRes.ok ? await gmailRes.json() : { connected: false };
      const outlookData = outlookRes.ok ? await outlookRes.json() : { connected: false };

      const gmailConnected = !!gmailData.connected;
      const outlookConnected = !!outlookData.connected;

      setIsConnected(gmailConnected);
      setIsOutlookConnected(outlookConnected);
      if (gmailData.email) setGmailEmail(gmailData.email);
      if (outlookData.email) setOutlookEmail(outlookData.email);

      if (!gmailConnected && !outlookConnected) {
        // Stay on dashboard — show inline connect UI
        return;
      }

      const savedDays = Number(localStorage.getItem("ola-sync-days") ?? "30");
      setSyncDays(savedDays);
      if (gmailConnected) { fetchLabels(); }
      fetchTags();
      fetchRules();
      // Only fetch emails once — don't re-fetch on subsequent GHL SSO calls
      if (!emailsLoadedRef.current) {
        emailsLoadedRef.current = true;
        fetchEmails(undefined, false, savedDays);
      }
    } catch { /* silent */ }
  }, [fetchLabels, fetchTags, fetchRules, fetchEmails]);

  useEffect(() => {
    initializeGmail().finally(() => setCheckingAuth(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-initialize ONLY when GHL SSO fires for the first time
  useEffect(() => {
    if (!ghlUser?.id || ghlSsoInitializedRef.current || intentionalDisconnectRef.current) return;
    ghlSsoInitializedRef.current = true;
    initializeGmail();
  }, [ghlUser?.id, initializeGmail]);

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
    // Force a fresh fetch for the new date range
    emailsLoadedRef.current = false;
    fetchEmails(undefined, true, days);
  };

  const handleSidebarFilter = (filter: SidebarFilter) => {
    setSidebarFilter(filter);
    setSelectedEmail(null);
    // No fetch — filteredEmails computes the view client-side from the already-loaded emails
  };

  // ── Silent background polling (every 60s, checks last 2 days only) ─────
  const emailIdsRef = useRef<Set<string>>(new Set());
  const newEmailsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const poll = async () => {
      if (!isConnected && !isOutlookConnected) return;
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
  }, [isConnected, isOutlookConnected, computeStats]);

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
    intentionalDisconnectRef.current = true;
    emailsLoadedRef.current = false;
    try { await fetch("/api/auth/gmail", { method: "DELETE" }); } catch { /* silent */ }
    setIsConnected(false);
    setGmailEmail(undefined);
    if (isOutlookConnected) {
      setActiveProviderFilter("outlook");
      fetchEmails(undefined, false, syncDays, "outlook");
    } else {
      setEmails([]);
    }
  };

  const handleDisconnectOutlook = async () => {
    intentionalDisconnectRef.current = true;
    emailsLoadedRef.current = false;
    try { await fetch("/api/auth/outlook", { method: "DELETE" }); } catch { /* silent */ }
    setIsOutlookConnected(false);
    setOutlookEmail(undefined);
    if (isConnected) {
      setActiveProviderFilter("gmail");
      fetchEmails(undefined, false, syncDays, "gmail");
    } else {
      setEmails([]);
    }
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
    // Sidebar filter — action requise: lead, contrat, visite tags
    if (sidebarFilter.type === "action") {
      if (!e.tags?.some(t => ["lead","contrat","visite"].includes(t))) return false;
    }
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
    // gmail-label: emails already fetched by label from server — pass through
    // Unread filter
    if (unreadOnly && e.isRead) return false;
    // Tab filter
    if (activeTab === "inbox") return !hasCategoryTag(e);
    if (activeTab === "visites") return emailMatchesTag(e, "visite");
    // "all" — no extra filter
    return true;
  });

  const displayEmails = filteredEmails;

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
    if (sidebarFilter.type === "action") return "Action requise";
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
    <div className="app-loading">
      <RefreshCw size={20} className="animate-spin" />
    </div>
  );


  const userLabels = labels.filter((l) => l.type === "user");

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">

      {/* ══ Top bar ══ */}
      <div className="topbar">
        <div className="topbar-search-wrap">
          <div className={`topbar-search${searchFocused ? " topbar-search--focused" : ""}`}>
            <Search size={14} style={{ color: "var(--c-text-3)", flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Rechercher dans les emails…"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="topbar-search-clear">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="topbar-right">
          {/* OLA sync status dot */}
          <span
            className={`sync-dot${ghlUserLoading ? " sync-dot--syncing" : ghlUser ? " sync-dot--ok" : " sync-dot--error"}`}
            title={ghlUserLoading ? "Connexion OLA en cours…" : ghlUser ? `OLA connecté${ghlUser.name ? ` · ${ghlUser.name}` : ""}` : "Non connecté à OLA"}
          />

          {/* Language toggle */}
          <button
            onClick={() => setLang((l) => {
              const next: Lang = l === "fr" ? "en" : "fr";
              localStorage.setItem("ola-lang", next);
              return next;
            })}
            className="topbar-lang-btn"
            title="Changer de langue / Switch language"
          >
            {lang === "fr" ? "EN" : "FR"}
          </button>

          {/* Settings panel */}
          <div style={{ position: "relative" }} ref={settingsPanelRef}>
            <div style={{ position: "relative", display: "inline-flex" }}>
              <button
                onClick={() => setShowSettingsPanel((v) => !v)}
                className={`topbar-icon-btn${showSettingsPanel ? " topbar-icon-btn--active" : ""}`}
                title="Réglages"
              >
                <Settings size={14} style={{ color: "var(--c-text-2)" }} />
              </button>
            </div>

            {showSettingsPanel && (
              <div className="settings-dropdown">
                <p className="settings-title">Réglages</p>

                {/* Email accounts */}
                <div>
                  <p className="settings-section-label">Comptes email</p>

                  {/* Gmail row */}
                  <div className="settings-account-row" style={{ marginBottom: 6 }}>
                    <span className={`settings-status-dot ${isConnected ? "settings-status-dot--on" : "settings-status-dot--off"}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="settings-account-name">Gmail</p>
                      {gmailEmail && <p className="settings-account-email">{gmailEmail}</p>}
                    </div>
                    {isConnected ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDisconnect(); setShowSettingsPanel(false); }}
                        className="settings-disconnect-btn"
                      >
                        Déconnecter
                      </button>
                    ) : (
                      <ConnectGmail compact ghlUserId={ghlUser?.id} onConnected={initializeGmail} />
                    )}
                  </div>

                  {/* Outlook row */}
                  <div className="settings-account-row">
                    <span className={`settings-status-dot ${isOutlookConnected ? "settings-status-dot--on" : "settings-status-dot--off"}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="settings-account-name">Outlook</p>
                      {outlookEmail && <p className="settings-account-email">{outlookEmail}</p>}
                    </div>
                    {isOutlookConnected ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDisconnectOutlook(); setShowSettingsPanel(false); }}
                        className="settings-disconnect-btn"
                      >
                        Déconnecter
                      </button>
                    ) : (
                      <ConnectOutlook compact ghlUserId={ghlUser?.id} onConnected={initializeGmail} />
                    )}
                  </div>
                </div>

                {/* Rédaction */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <p className="settings-section-label">Rédaction</p>

                  <label className="toggle-row">
                    <div className="toggle-label">
                      <p>Brander les courriels auto.</p>
                      <p>Ajouter ta marque à chaque réponse IA</p>
                    </div>
                    <button
                      onClick={() => setAutoBrand((v) => { const next = !v; localStorage.setItem("ola-auto-brand", String(next)); return next; })}
                      className={`toggle-switch${autoBrand ? " toggle-switch--on" : ""}`}
                    >
                      <span className="toggle-switch-thumb" />
                    </button>
                  </label>

                  <label className="toggle-row">
                    <div className="toggle-label">
                      <p>Signature automatique</p>
                      <p>Ajouter ta signature en bas de chaque email</p>
                    </div>
                    <button
                      onClick={() => setAutoSignature((v) => { const next = !v; localStorage.setItem("ola-auto-signature", String(next)); return next; })}
                      className={`toggle-switch${autoSignature ? " toggle-switch--on" : ""}`}
                    >
                      <span className="toggle-switch-thumb" />
                    </button>
                  </label>

                  {autoSignature && (
                    <textarea
                      value={signatureText}
                      onChange={(e) => { setSignatureText(e.target.value); localStorage.setItem("ola-signature-text", e.target.value); }}
                      placeholder={"Cordialement,\nJean Tremblay\nAgent immobilier — 514-555-0000"}
                      rows={3}
                      className="settings-input"
                      style={{ resize: "none" }}
                    />
                  )}
                </div>

              </div>
            )}
          </div>

        </div>
      </div>

      {/* ══ Error banner ══ */}
      {error && (
        <div className="error-banner">
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} className="error-banner-close">×</button>
        </div>
      )}

      {/* ══ Body ══ */}
      <div className="app-body">

        {/* ── Sidebar ── */}
        <div className="sidebar">

          {/* Compose button */}
          <div className="sidebar-compose-wrap">
            <button
              onClick={() => { setShowComposeFreeform(true); setSelectedEmail(null); }}
              className="sidebar-compose-btn sidebar-compose-btn--primary"
            >
              <span className="sidebar-compose-icon">+</span>
              Nouveau message
            </button>
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav">
            <SidebarItem
              label="Boîte de réception"
              count={emails.length || undefined}
              active={sidebarFilter.type === "all" && activeTab === "all"}
              onClick={() => { handleSidebarFilter({ type: "all" }); setActiveTab("all"); }}
            />
            <SidebarItem
              label="Action requise"
              count={emails.filter(e => e.tags?.some(t => ["lead","contrat","visite"].includes(t))).length || undefined}
              active={sidebarFilter.type === "action"}
              onClick={() => { handleSidebarFilter({ type: "action" }); setActiveTab("all"); }}
            />
          </nav>


          {/* Gmail native labels — collapsible */}
          {userLabels.length > 0 && (
            <div className="sidebar-section">
              <button
                className="sidebar-section-header"
                onClick={() => setLabelsExpanded(v => !v)}
              >
                <span>Libellés</span>
                <span className={`sidebar-section-arrow${labelsExpanded ? " sidebar-section-arrow--open" : ""}`}>›</span>
              </button>
              {labelsExpanded && (
                <nav className="sidebar-nav sidebar-nav--sub">
                  {userLabels.map(lbl => (
                    <SidebarItem
                      key={lbl.id}
                      label={lbl.name}
                      active={sidebarFilter.type === "gmail-label" && sidebarFilter.value === lbl.id}
                      onClick={() => { handleSidebarFilter({ type: "gmail-label", value: lbl.id }); setActiveTab("all"); setSelectedEmail(null); }}
                    />
                  ))}
                </nav>
              )}
            </div>
          )}

          {/* Accounts section — pinned to bottom */}
          <div className="sidebar-accounts">
            <p className="sidebar-accounts-label">Comptes</p>
            {isConnected && (
              <div className="sidebar-account-row">
                <div className="sidebar-account-avatar">G</div>
                <div className="sidebar-account-info">
                  <p className="sidebar-account-name">Gmail</p>
                  {gmailEmail && <p className="sidebar-account-email">{gmailEmail}</p>}
                </div>
                <span className="sidebar-account-dot sidebar-account-dot--on" />
              </div>
            )}
            {isOutlookConnected && (
              <div className="sidebar-account-row">
                <div className="sidebar-account-avatar">O</div>
                <div className="sidebar-account-info">
                  <p className="sidebar-account-name">Outlook</p>
                  {outlookEmail && <p className="sidebar-account-email">{outlookEmail}</p>}
                </div>
                <span className="sidebar-account-dot sidebar-account-dot--on" />
              </div>
            )}
            {!isConnected && !isOutlookConnected && (
              <div className="sidebar-account-row">
                <div className="sidebar-account-info">
                  <p className="sidebar-account-name" style={{ opacity: 0.5 }}>Aucun compte</p>
                </div>
                <span className="sidebar-account-dot sidebar-account-dot--off" />
              </div>
            )}
          </div>

        </div>

        {/* ── Email list — hidden while reading or composing except on visites tab ── */}
        {(!selectedEmail && !showComposeFreeform || activeTab === "visites") && (
          <div className={`${selectedEmail && activeTab === "visites" ? "email-list-panel" : "email-list-panel email-list-panel--full"}`}>
            {/* New emails toast (auto-dismisses) */}
            {newEmailsCount > 0 && (
              <div className="new-emails-toast">
                {newEmailsCount} nouveau{newEmailsCount > 1 ? "x" : ""} email{newEmailsCount > 1 ? "s" : ""} ajouté{newEmailsCount > 1 ? "s" : ""}
              </div>
            )}

            {/* List toolbar */}
            <div className="list-toolbar">
              <div className="list-toolbar-left">
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  title="Actualiser"
                  className="toolbar-icon-btn"
                >
                  <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setUnreadOnly((v) => !v)}
                  className={`toolbar-pill-btn${unreadOnly ? " toolbar-pill-btn--active" : ""}`}
                >
                  Non lus{unreadOnly && emails.filter(e => !e.isRead).length > 0 ? ` · ${emails.filter(e => !e.isRead).length}` : ""}
                </button>
                {displayEmails.some(e => !e.isRead) && (
                  <button
                    onClick={handleMarkAllRead}
                    className="toolbar-pill-btn"
                  >
                    Tout lu
                  </button>
                )}
              </div>
            </div>

            {/* Inline connect prompt when no mailbox is linked */}
            {!isConnected && !isOutlookConnected && !checkingAuth ? (
              <div className="inline-connect-prompt">
                <p className="inline-connect-title">Connectez votre boîte mail</p>
                <p className="inline-connect-sub">Reliez Gmail ou Outlook pour voir vos emails ici.</p>
                <div className="inline-connect-buttons">
                  <ConnectGmail
                    compact
                    isConnected={false}
                    ghlUserId={ghlUser?.id}
                    onConnected={() => { emailsLoadedRef.current = false; initializeGmail(); }}
                  />
                  <ConnectOutlook
                    compact
                    isConnected={false}
                    ghlUserId={ghlUser?.id}
                    onConnected={() => { emailsLoadedRef.current = false; initializeGmail(); }}
                  />
                </div>
              </div>
            ) : isLoading ? (
              <div className="list-loading-state">
                <RefreshCw size={18} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                <p>Chargement…</p>
              </div>
            ) : activeTab === "visites" ? (
              <VisitesCalendar
                emails={displayEmails}
                onSelect={(e) => { setSelectedEmail(e); if (!e.isRead) handleSetRead(e.id, true); }}
                selectedId={selectedEmail?.id}
                isDark={isDark}
              />
            ) : displayEmails.length === 0 ? (
              <div className="email-list">
                <EmptyState
                  labels={userLabels}
                  onSelect={(id) => { handleSidebarFilter({ type: "gmail-label", value: id }); setActiveTab("all"); }}
                  hasEmails={emails.length > 0}
                />
              </div>
            ) : (
              <div className="email-list">
                <EmailList
                  emails={displayEmails}
                  selectedId={undefined}
                  onSelect={(e) => { setSelectedEmail(e); if (!e.isRead) handleSetRead(e.id, true); }}
                  allTags={allTags}
                  showAddContact={false}
                  onQuickAddContact={handleQuickAddContact}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Compose pane ── */}
        {showComposeFreeform && !selectedEmail && (
          <div className="compose-pane">
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
            <div className="reading-pane">
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
  label, count, active, onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`sidebar-item${active ? " sidebar-item--active" : ""}`}
    >
      <span className="sidebar-item-label">{label}</span>
      {count !== undefined && (
        <span className="sidebar-item-count">{count}</span>
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
      <div className="list-empty-state">
        <p className="list-empty-state-sub">Aucun email dans cette catégorie</p>
      </div>
    );
  }
  return (
    <div className="list-empty-state">
      <div>
        <p className="list-empty-state-title">
          {labels.length > 0 ? "Choisissez un dossier" : "Cliquez sur Synchroniser"}
        </p>
        <p className="list-empty-state-sub">
          {labels.length > 0
            ? "ou cliquez sur Synchroniser pour charger les emails"
            : "pour récupérer vos emails Gmail"}
        </p>
      </div>
      {labels.length > 0 && (
        <div className="empty-label-list">
          {labels.slice(0, 6).map((l) => (
            <button
              key={l.id}
              onClick={() => onSelect(l.id)}
              className="empty-label-btn"
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
