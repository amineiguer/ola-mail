"use client";

import { EmailItem } from "@/app/dashboard/page";
import { Calendar, MapPin, Clock, Check, X } from "lucide-react";
import { format, parseISO, isToday, isTomorrow, startOfDay, isAfter } from "date-fns";
import { fr } from "date-fns/locale";

interface AppointmentCard {
  email: EmailItem;
  date: string;
  startTime: string;
  endTime: string;
  address?: string;
  replyUrl: string | null;
}

const FR_MONTHS: Record<string, string> = {
  janvier:"01", février:"02", mars:"03", avril:"04", mai:"05", juin:"06",
  juillet:"07", août:"08", septembre:"09", octobre:"10", novembre:"11", décembre:"12",
  jan:"01", fév:"02", mar:"03", avr:"04", juil:"07", sep:"09", oct:"10", nov:"11", déc:"12",
};

function parseTimeStr(t: string): string {
  return t.replace(/h(\d{2})?$/, (_, m) => `:${m ?? "00"}`);
}

function parseFrDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/);
  if (!m) return null;
  const mNum = FR_MONTHS[m[2].toLowerCase()];
  if (!mNum) return null;
  const year = m[3] ?? new Date().getFullYear().toString();
  return `${year}-${mNum}-${m[1].padStart(2, "0")}`;
}

function parseAppointment(email: EmailItem): AppointmentCard | null {
  const body = email.body ?? email.snippet ?? "";
  if (!body) return null;

  const dateRe = /Date(?:\/heure)?\s*:\s*(?:\w+\.?,?\s*)?(\d{4}-\d{2}-\d{2}|\d{1,2}\s+\w+(?:\s+\d{4})?)\s*[,à]?\s*(\d{2}[h:]\d{0,2})\s*[-–à]\s*(\d{2}[h:]\d{0,2})/i;
  const addrRe = /Adresse\s*:\s*([^\n]+)/i;

  const dm = body.match(dateRe);
  if (!dm) return null;

  const dateStr = parseFrDate(dm[1]);
  if (!dateStr) return null;

  const startTime = parseTimeStr(dm[2]);
  const endTime = parseTimeStr(dm[3]);

  const addrMatch = body.match(addrRe);
  const address = addrMatch?.[1]?.trim().replace(/^#_\d+,\s*/, "") ?? undefined;

  const replyMatch = body.match(/https?:\/\/(?:www\.)?(?:immocontact|centris|duproprio|flexmls)[^\s<")\]]+/i)
    ?? body.match(/https?:\/\/[^\s<")\]]+(?:reply|confirm|accept|refuse|visite|showing|rdv|appointment)[^\s<")\]]*/i);
  const replyUrl = replyMatch ? replyMatch[0].replace(/[.)]+$/, "") : null;

  return { email, date: dateStr, startTime, endTime, address, replyUrl };
}

function formatDateLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Aujourd'hui";
    if (isTomorrow(d)) return "Demain";
    return format(d, "EEEE d MMMM", { locale: fr });
  } catch {
    return dateStr;
  }
}

interface VisitesCalendarProps {
  emails: EmailItem[];
  onSelect: (email: EmailItem) => void;
  selectedId?: string;
  isDark?: boolean;
}

export default function VisitesCalendar({ emails, onSelect, selectedId, isDark }: VisitesCalendarProps) {
  const appointments: AppointmentCard[] = [];

  for (const email of emails) {
    const appt = parseAppointment(email);
    if (appt) appointments.push(appt);
  }

  appointments.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));

  const groups = new Map<string, AppointmentCard[]>();
  for (const appt of appointments) {
    if (!groups.has(appt.date)) groups.set(appt.date, []);
    groups.get(appt.date)!.push(appt);
  }

  const today = startOfDay(new Date());
  const allGroups: [string, AppointmentCard[]][] = Array.from(groups.entries());
  const upcoming = allGroups.filter(([d]) => {
    try { return !isAfter(today, startOfDay(parseISO(d))); } catch { return true; }
  });
  const past = allGroups.filter(([d]) => {
    try { return isAfter(today, startOfDay(parseISO(d))); } catch { return false; }
  });

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[#9aa0a6]">
        <Calendar className="w-10 h-10 opacity-40" />
        <p className="text-[14px]">Aucune visite trouvée</p>
        <p className="text-[12px] text-center max-w-[220px]">
          Les emails immocontact avec une date seront affichés ici
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      {upcoming.map(([date, appts]) => (
        <div key={date}>
          <div className="flex items-baseline gap-2 mb-2.5">
            <span className={`text-[13px] font-semibold capitalize ${
              isToday(parseISO(date))
                ? "text-[#1a73e8] dark:text-[#a8c7fa]"
                : "text-[#202124] dark:text-[#e8eaed]"
            }`}>
              {formatDateLabel(date)}
            </span>
            <span className="text-[11px] text-[#9aa0a6]">
              {format(parseISO(date), "d MMMM yyyy", { locale: fr })}
            </span>
          </div>
          <div className="space-y-2">
            {appts.map((appt: AppointmentCard) => (
              <ApptCard
                key={appt.email.id}
                appt={appt}
                isSelected={appt.email.id === selectedId}
                onSelect={() => onSelect(appt.email)}
                isDark={isDark}
              />
            ))}
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <details>
          <summary className="text-[12px] text-[#9aa0a6] cursor-pointer select-none mb-3 list-none flex items-center gap-1">
            <span className="opacity-60">▸</span>
            {past.reduce((s, [, a]) => s + a.length, 0)} visite{past.reduce((s, [, a]) => s + a.length, 0) > 1 ? "s" : ""} passée{past.reduce((s, [, a]) => s + a.length, 0) > 1 ? "s" : ""}
          </summary>
          {past.map(([date, appts]: [string, AppointmentCard[]]) => (
            <div key={date} className="mb-4 opacity-50">
              <p className="text-[12px] font-medium capitalize text-[#5f6368] dark:text-[#9aa0a6] mb-1.5">
                {formatDateLabel(date)}
              </p>
              <div className="space-y-1.5">
                {appts.map((appt: AppointmentCard) => (
                  <ApptCard
                    key={appt.email.id}
                    appt={appt}
                    isSelected={appt.email.id === selectedId}
                    onSelect={() => onSelect(appt.email)}
                    isDark={isDark}
                  />
                ))}
              </div>
            </div>
          ))}
        </details>
      )}

    </div>
  );
}

function ApptCard({ appt, isSelected, onSelect, isDark }: {
  appt: AppointmentCard;
  isSelected: boolean;
  onSelect: () => void;
  isDark?: boolean;
}) {
  const isUnread = appt.email.isRead === false || appt.email.isRead === undefined;
  void isDark;

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-xl border transition-all cursor-pointer overflow-hidden ${
        isSelected
          ? "bg-[#c2dbff] dark:bg-[#394457] border-transparent shadow-sm"
          : "bg-white dark:bg-[#2d2e30] border-[#e0e0e0] dark:border-[#3c4043] hover:border-[#ce93d8] hover:shadow-sm"
      }`}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#7b1fa2] dark:bg-[#ce93d8]" />

      <div className="pl-4 pr-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Time */}
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-[#7b1fa2] dark:text-[#ce93d8] flex-shrink-0" />
              <span className={`text-[13px] font-semibold ${isSelected ? "text-[#0b57d0] dark:text-[#a8c7fa]" : "text-[#202124] dark:text-[#e8eaed]"}`}>
                {appt.startTime} – {appt.endTime}
              </span>
              {isUnread && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] flex-shrink-0" />
              )}
            </div>
            {/* Address */}
            {appt.address && (
              <div className="flex items-start gap-1.5 mb-1">
                <MapPin className="w-3 h-3 text-[#9aa0a6] flex-shrink-0 mt-0.5" />
                <span className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] line-clamp-1">{appt.address}</span>
              </div>
            )}
            {/* Subject */}
            <p className="text-[12px] text-[#9aa0a6] truncate">{appt.email.subject}</p>
          </div>

          {/* Action buttons */}
          {appt.replyUrl && (
            <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
              <a
                href={appt.replyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#e6f4ea] dark:bg-[#1e3a2f] text-[#137333] dark:text-[#81c995] text-[11px] font-medium hover:bg-[#ceead6] dark:hover:bg-[#1e4a35] transition-colors whitespace-nowrap"
              >
                <Check className="w-3 h-3" />
                Confirmer
              </a>
              <a
                href={appt.replyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#fce8e6] dark:bg-[#3b1f1e] text-[#c5221f] dark:text-[#f28b82] text-[11px] font-medium hover:bg-[#fad2cf] dark:hover:bg-[#4a2020] transition-colors whitespace-nowrap"
              >
                <X className="w-3 h-3" />
                Refuser
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
