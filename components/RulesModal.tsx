"use client";

import { useState } from "react";
import { Rule } from "@/lib/storage";
import { Tag as TagType } from "@/lib/tags-config";
import { X, Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, Sparkles, Loader2 } from "lucide-react";

interface RulesModalProps {
  rules: Rule[];
  allTags: TagType[];
  onClose: () => void;
  onRulesChange: (rules: Rule[]) => void;
}

const FIELD_OPTIONS = [
  { value: "from", label: "Expéditeur" },
  { value: "subject", label: "Objet" },
  { value: "snippet", label: "Extrait" },
] as const;

const OPERATOR_OPTIONS = [
  { value: "contains", label: "contient" },
  { value: "not_contains", label: "ne contient pas" },
  { value: "equals", label: "est égal à" },
  { value: "starts_with", label: "commence par" },
] as const;

type Field = typeof FIELD_OPTIONS[number]["value"];
type Operator = typeof OPERATOR_OPTIONS[number]["value"];

interface NewRuleForm {
  name: string;
  field: Field;
  operator: Operator;
  value: string;
  tagId: string;
}

const DEFAULT_FORM: NewRuleForm = {
  name: "",
  field: "subject",
  operator: "contains",
  value: "",
  tagId: "",
};

export default function RulesModal({ rules, allTags, onClose, onRulesChange }: RulesModalProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState<NewRuleForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/ai/suggest-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: aiPrompt,
          availableTags: allTags.map((t) => ({ id: t.id, name: t.name })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ name: data.name, field: data.field, operator: data.operator, value: data.value, tagId: data.tagId });
      setAiPrompt("");
    } catch {
      setAiError("Impossible de générer. Décris plus précisément ou remplis manuellement.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggle = async (rule: Rule) => {
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        onRulesChange(rules.map((r) => (r.id === rule.id ? data.rule : r)));
      }
    } catch { /* silent */ }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/rules/${ruleId}`, { method: "DELETE" });
      if (res.ok) {
        onRulesChange(rules.filter((r) => r.id !== ruleId));
      }
    } catch { /* silent */ }
  };

  const handleCreate = async () => {
    setFormError("");
    if (!form.name.trim()) { setFormError("Le nom est requis"); return; }
    if (!form.value.trim()) { setFormError("La valeur de condition est requise"); return; }
    if (!form.tagId) { setFormError("Choisissez une étiquette pour l'action"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          conditions: [{ field: form.field, operator: form.operator, value: form.value.trim() }],
          action: { tagId: form.tagId },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onRulesChange([...rules, data.rule]);
      setForm(DEFAULT_FORM);
      setShowNewForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 dark:bg-black/50" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="w-[440px] flex-shrink-0 bg-white dark:bg-[#202124] shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e0e0] dark:border-[#3c4043] flex-shrink-0">
          <h2 className="text-[16px] font-medium text-[#202124] dark:text-[#e8eaed]">Règles</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[#e8eaed] dark:hover:bg-[#3c4043] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] mb-4">
            Les règles ajoutent automatiquement des étiquettes aux emails entrants selon des conditions.
          </p>

          {/* Rules list */}
          {rules.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[13px] text-[#9aa0a6]">Aucune règle définie</p>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {rules.map((rule) => {
                const actionTag = allTags.find((t) => t.id === rule.action.tagId);
                return (
                  <div
                    key={rule.id}
                    className="border border-[#e0e0e0] dark:border-[#3c4043] rounded-xl p-3 bg-white dark:bg-[#2d2e30]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[13px] font-medium ${rule.enabled ? "text-[#202124] dark:text-[#e8eaed]" : "text-[#9aa0a6] line-through"}`}>
                        {rule.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggle(rule)}
                          className="w-8 h-8 rounded-full hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] flex items-center justify-center transition-colors"
                          title={rule.enabled ? "Désactiver" : "Activer"}
                        >
                          {rule.enabled
                            ? <ToggleRight className="w-5 h-5 text-[#1a73e8] dark:text-[#a8c7fa]" />
                            : <ToggleLeft className="w-5 h-5 text-[#9aa0a6]" />}
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="w-8 h-8 rounded-full hover:bg-[#fce8e6] dark:hover:bg-[#3b1f1e] flex items-center justify-center transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4 text-[#c5221f] dark:text-[#f28b82]" />
                        </button>
                      </div>
                    </div>

                    {/* Conditions */}
                    <div className="space-y-1">
                      {rule.conditions.map((cond, i) => {
                        const fieldLabel = FIELD_OPTIONS.find((f) => f.value === cond.field)?.label ?? cond.field;
                        const opLabel = OPERATOR_OPTIONS.find((o) => o.value === cond.operator)?.label ?? cond.operator;
                        return (
                          <p key={i} className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">
                            Si <span className="text-[#202124] dark:text-[#e8eaed]">{fieldLabel}</span>{" "}
                            <span className="italic">{opLabel}</span>{" "}
                            <span className="text-[#202124] dark:text-[#e8eaed] font-mono bg-[#f1f3f4] dark:bg-[#3c4043] px-1 rounded">
                              &ldquo;{cond.value}&rdquo;
                            </span>
                          </p>
                        );
                      })}
                    </div>

                    {/* Action */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">→ Ajouter étiquette :</span>
                      {actionTag ? (
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded-sm font-medium"
                          style={{ backgroundColor: actionTag.color, color: actionTag.textColor }}
                        >
                          {actionTag.name}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#9aa0a6]">{rule.action.tagId}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* New rule form */}
          {showNewForm ? (
            <div className="border border-[#e0e0e0] dark:border-[#3c4043] rounded-xl p-4 bg-[#fafafa] dark:bg-[#2d2e30]">
              <h3 className="text-[14px] font-medium text-[#202124] dark:text-[#e8eaed] mb-3">Nouvelle règle</h3>

              {/* AI prompt */}
              <div className="mb-4 p-3 bg-[#f0f4ff] dark:bg-[#1a2030] rounded-lg border border-[#c5d8ff] dark:border-[#2a3a60]">
                <label className="text-[12px] font-medium text-[#1a73e8] dark:text-[#a8c7fa] block mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Décrire la règle à l&apos;IA
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAiGenerate(); }}
                    placeholder="Ex: emails de immocontact → étiquette Visite"
                    className="flex-1 text-[13px] bg-white dark:bg-[#202124] border border-[#c5d8ff] dark:border-[#2a3a60] rounded-lg px-3 py-2 text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] transition-colors placeholder-[#9aa0a6]"
                  />
                  <button
                    onClick={handleAiGenerate}
                    disabled={aiLoading || !aiPrompt.trim()}
                    className="flex items-center gap-1.5 text-[13px] font-medium bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors flex-shrink-0"
                  >
                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {aiError && <p className="text-[11px] text-[#c5221f] mt-1">{aiError}</p>}
              </div>

              {/* Name */}
              <div className="mb-3">
                <label className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] block mb-1">Nom de la règle</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Emails urgents du notaire"
                  className="w-full text-[13px] bg-white dark:bg-[#202124] border border-[#e0e0e0] dark:border-[#3c4043] rounded-lg px-3 py-2 text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] transition-colors"
                />
              </div>

              {/* Condition */}
              <div className="mb-3">
                <label className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] block mb-1">Condition</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6]">Si</span>

                  {/* Field */}
                  <div className="relative">
                    <select
                      value={form.field}
                      onChange={(e) => setForm((p) => ({ ...p, field: e.target.value as Field }))}
                      className="text-[13px] bg-white dark:bg-[#202124] border border-[#e0e0e0] dark:border-[#3c4043] rounded-lg px-2 py-1.5 pr-7 text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] appearance-none"
                    >
                      {FIELD_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9aa0a6] pointer-events-none" />
                  </div>

                  {/* Operator */}
                  <div className="relative">
                    <select
                      value={form.operator}
                      onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value as Operator }))}
                      className="text-[13px] bg-white dark:bg-[#202124] border border-[#e0e0e0] dark:border-[#3c4043] rounded-lg px-2 py-1.5 pr-7 text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] appearance-none"
                    >
                      {OPERATOR_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9aa0a6] pointer-events-none" />
                  </div>
                </div>

                <input
                  type="text"
                  value={form.value}
                  onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
                  placeholder="Valeur à rechercher..."
                  className="mt-2 w-full text-[13px] bg-white dark:bg-[#202124] border border-[#e0e0e0] dark:border-[#3c4043] rounded-lg px-3 py-2 text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] transition-colors"
                />
              </div>

              {/* Action */}
              <div className="mb-3">
                <label className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] block mb-1">Action — Ajouter l&apos;étiquette</label>
                <div className="relative">
                  <select
                    value={form.tagId}
                    onChange={(e) => setForm((p) => ({ ...p, tagId: e.target.value }))}
                    className="w-full text-[13px] bg-white dark:bg-[#202124] border border-[#e0e0e0] dark:border-[#3c4043] rounded-lg px-3 py-2 pr-8 text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] appearance-none"
                  >
                    <option value="">Choisir une étiquette...</option>
                    <optgroup label="Action">
                      {allTags.filter((t) => t.group === "action").map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Immobilier">
                      {allTags.filter((t) => t.group === "realestate").map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                    {allTags.filter((t) => t.group === "custom").length > 0 && (
                      <optgroup label="Personnalisées">
                        {allTags.filter((t) => t.group === "custom").map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9aa0a6] pointer-events-none" />
                </div>
              </div>

              {formError && (
                <p className="text-[12px] text-[#c5221f] dark:text-[#f28b82] mb-3">{formError}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded-full transition-colors"
                >
                  {saving ? "Enregistrement..." : "Enregistrer la règle"}
                </button>
                <button
                  onClick={() => { setShowNewForm(false); setForm(DEFAULT_FORM); setFormError(""); }}
                  className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] px-3 py-2 rounded-full hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 text-[13px] text-[#1a73e8] dark:text-[#a8c7fa] hover:bg-[#e8f0fe] dark:hover:bg-[#1a2744] px-4 py-2 rounded-full transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              Nouvelle règle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
