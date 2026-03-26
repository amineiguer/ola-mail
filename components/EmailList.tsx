"use client";

import { useState } from "react";
import { EmailItem } from "@/app/dashboard/page";
import { Tag as TagType } from "@/lib/tags-config";
import {
  Paperclip, UserPlus, Check, Loader2,
  AlertCircle, Zap, Home, Users, FileText, FileCheck, Search, Building, Gavel, Mail,
} from "lucide-react";

// Category icon + color — mirrors sidebar REALESTATE_NAV
const CATEGORY_ICON: Record<string, { Icon: React.ElementType; color: string; darkColor: string }> = {
  visite:      { Icon: Home,      color: "#1a73e8", darkColor: "#a8c7fa" },
  lead:        { Icon: Users,     color: "#5f6368", darkColor: "#9aa0a6" },
  client:      { Icon: Users,     color: "#137333", darkColor: "#81c995" },
  contrat:     { Icon: FileText,  color: "#b06000", darkColor: "#fdd663" },
  offre:       { Icon: FileCheck, color: "#7b1fa2", darkColor: "#ce93d8" },
  signature:   { Icon: FileCheck, color: "#3949ab", darkColor: "#9fa8da" },
  inspection:  { Icon: Search,    color: "#00695c", darkColor: "#80cbc4" },
  financement: { Icon: Building,  color: "#0288d1", darkColor: "#81d4fa" },
  notaire:     { Icon: Gavel,     color: "#b71c1c", darkColor: "#ef9a9a" },
};
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface EmailListProps {
  emails: EmailItem[];
  selectedId?: string;
  onSelect: (email: EmailItem) => void;
  allTags?: TagType[];
  showAddContact?: boolean;
  onQuickAddContact?: (email: EmailItem) => Promise<void>;
}

function formatSender(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*(?:<.*>)?$/);
  return (match ? match[1].trim() : from).substring(0, 22);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 36e5;
    if (diffH < 24) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (diffH < 168) return formatDistanceToNow(d, { locale: fr });
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function getEmailTagIds(email: EmailItem): string[] {
  const manual = email.tags ?? [];
  const ai = email.aiTags?.suggestedTags ?? [];
  return Array.from(new Set([...manual, ...ai]));
}

export default function EmailList({
  emails, selectedId, onSelect, allTags = [], showAddContact = false, onQuickAddContact,
}: EmailListProps) {
  const [addingId, setAddingId] = useState<string | null>(null);

  const handleAdd = async (e: React.MouseEvent, email: EmailItem) => {
    e.stopPropagation();
    if (addingId === email.id) return;
    setAddingId(email.id);
    try {
      await onQuickAddContact?.(email);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="select-none">
      {emails.map((email) => {
        const isSelected = email.id === selectedId;
        const isContract = email.analysis?.isContract;
        const isUploaded = email.ghlUpload?.uploaded;
        const isUnread = email.isRead === false || email.isRead === undefined;
        const isUrgent = email.aiTags?.urgency === "urgent";
        const needsReply = email.aiTags?.needsReply;
        const senderShort = formatSender(email.from);
        const isAdding = addingId === email.id;
        const isAdded = !!email.linkedContact;

        // Contact info extracted by AI
        const ec = email.analysis?.extractedContact;
        const canQuickAdd = showAddContact && ec && (ec.name || ec.email) && !isAdded;

        // Category icon
        const category = email.aiTags?.category ?? null;
        const catDef = category ? CATEGORY_ICON[category] : null;
        const CatIcon = catDef?.Icon ?? null;

        // Tag chips — skip category tags (icon already shows that), only custom tags
        const CATEGORY_TAG_IDS = ["visite","lead","client","contrat","offre","signature","inspection","financement","notaire","immo"];
        const tagIds = getEmailTagIds(email).filter(id => !CATEGORY_TAG_IDS.includes(id)).slice(0, 1);
        const tagObjects = tagIds
          .map((id) => allTags.find((t) => t.id === id))
          .filter(Boolean) as TagType[];

        return (
          <div
            key={email.id}
            onClick={() => onSelect(email)}
            className={`group relative flex items-center gap-3 pl-4 pr-3 cursor-pointer border-b transition-all
              ${isSelected
                ? "bg-[#c2dbff] dark:bg-[#394457] border-b-transparent"
                : isUnread
                  ? "bg-white dark:bg-[#202124] border-[#e0e0e0] dark:border-[#3c4043] hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,.3),0_2px_6px_2px_rgba(60,64,67,.15)] dark:hover:shadow-none dark:hover:bg-[#2d2e30]"
                  : "bg-[#f6f8fc] dark:bg-[#1a1a1a] border-[#e0e0e0] dark:border-[#3c4043] hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,.3)] dark:hover:shadow-none dark:hover:bg-[#2d2e30]"
              }`}
            style={{ minHeight: 54, paddingTop: 8, paddingBottom: 8 }}
          >
            {/* Left indicator — priority: urgent > needsReply > category icon > unread dot */}
            <div className="flex-shrink-0 w-5 flex items-center justify-center">
              {isUrgent ? (
                <AlertCircle className="w-4 h-4 text-[#c5221f] dark:text-[#f28b82]" />
              ) : needsReply ? (
                <Zap className="w-4 h-4 text-[#f6ae2d] fill-[#f6ae2d]" />
              ) : CatIcon && catDef ? (
                <CatIcon
                  className="w-4 h-4"
                  style={{ color: catDef.color }}
                  title={category ?? ""}
                />
              ) : isUnread && !isSelected ? (
                <span className="w-2 h-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa]" title="Non lu" />
              ) : (
                <Mail className="w-4 h-4 text-[#dadce0] dark:text-[#3c4043] opacity-0 group-hover:opacity-60" />
              )}
            </div>

            {/* Sender */}
            <span className={`w-[130px] flex-shrink-0 text-[13px] truncate
              ${isUnread && !isSelected ? "font-semibold text-[#202124] dark:text-[#e8eaed]" : "font-normal text-[#444746] dark:text-[#9aa0a6]"}
            `}>
              {senderShort}
            </span>

            {/* Subject + snippet + tags */}
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
              <span className="text-[13px] truncate flex-1">
                <span className={isUnread && !isSelected ? "font-semibold text-[#202124] dark:text-[#e8eaed]" : "font-normal text-[#202124] dark:text-[#c4c7c5]"}>
                  {email.subject}
                </span>
                {email.snippet && (
                  <span className="text-[#5f6368] dark:text-[#9aa0a6] font-normal">
                    {" "}—{" "}{email.snippet.substring(0, 60)}
                  </span>
                )}
              </span>

              {tagObjects.map((tag) => (
                <TagChip key={tag.id} tag={tag} />
              ))}

              {isContract && (
                <span className={`flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap
                  ${isUploaded
                    ? "bg-[#e6f4ea] dark:bg-[#1e3a2f] text-[#137333] dark:text-[#81c995]"
                    : "bg-[#e8f0fe] dark:bg-[#1a2744] text-[#1a73e8] dark:text-[#a8c7fa]"
                  }`}>
                  {isUploaded ? "✓ OLA" : "Contrat"}
                </span>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 flex-shrink-0 ml-1">
              {/* Quick add to CRM */}
              {showAddContact && (
                <div onClick={(e) => e.stopPropagation()}>
                  {isAdded ? (
                    <span className="flex items-center gap-1 text-[11px] text-[#137333] dark:text-[#81c995] font-medium px-2 py-1 bg-[#e6f4ea] dark:bg-[#1e3a2f] rounded-full">
                      <Check className="w-3 h-3" /> OLA
                    </span>
                  ) : canQuickAdd ? (
                    <button
                      onClick={(e) => handleAdd(e, email)}
                      disabled={isAdding}
                      className="flex items-center gap-1 text-[11px] font-medium text-[#1a73e8] dark:text-[#a8c7fa] hover:bg-[#e8f0fe] dark:hover:bg-[#1a2744] px-2 py-1 rounded-full transition-colors border border-[#1a73e8] dark:border-[#a8c7fa] opacity-0 group-hover:opacity-100"
                      title={`Ajouter ${ec?.name ?? ""} dans OLA`}
                    >
                      {isAdding
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <UserPlus className="w-3 h-3" />}
                      {isAdding ? "" : "Ajouter"}
                    </button>
                  ) : null}
                </div>
              )}

              {email.hasAttachment && (
                <Paperclip className="w-3.5 h-3.5 text-[#5f6368] dark:text-[#9aa0a6]" />
              )}
              <span className={`text-[12px] w-[48px] text-right flex-shrink-0
                ${isUnread && !isSelected ? "font-semibold text-[#202124] dark:text-[#e8eaed]" : "text-[#5f6368] dark:text-[#9aa0a6]"}`}>
                {formatDate(email.date)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TagChip({ tag, onRemove, isDark }: { tag: TagType; onRemove?: () => void; isDark?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-sm font-medium leading-none flex-shrink-0"
      style={{
        backgroundColor: isDark ? tag.darkColor : tag.color,
        color: isDark ? tag.darkTextColor : tag.textColor,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-60 hover:opacity-100 transition-opacity ml-0.5"
          aria-label={`Supprimer ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
