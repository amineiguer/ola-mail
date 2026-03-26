"use client";

import { useState } from "react";
import { CustomTag } from "@/lib/storage";
import { X, Sparkles, Loader2 } from "lucide-react";

interface CreateTagModalProps {
  onClose: () => void;
  onCreated: (tag: CustomTag) => void;
}

const PRESET_COLORS = [
  { color: "#e8f0fe", darkColor: "#1a2744", textColor: "#1a73e8", darkTextColor: "#a8c7fa", label: "Bleu" },
  { color: "#e6f4ea", darkColor: "#1e3a2f", textColor: "#137333", darkTextColor: "#81c995", label: "Vert" },
  { color: "#fce8e6", darkColor: "#3b1f1e", textColor: "#c5221f", darkTextColor: "#f28b82", label: "Rouge" },
  { color: "#fef7e0", darkColor: "#3a2f00", textColor: "#b06000", darkTextColor: "#fdd663", label: "Jaune" },
  { color: "#f3e8fd", darkColor: "#2a1a3a", textColor: "#7b1fa2", darkTextColor: "#ce93d8", label: "Violet" },
  { color: "#e0f7fa", darkColor: "#002d30", textColor: "#00695c", darkTextColor: "#80cbc4", label: "Cyan" },
  { color: "#fff3e0", darkColor: "#3a1f00", textColor: "#e65100", darkTextColor: "#ffcc80", label: "Orange" },
  { color: "#f1f3f4", darkColor: "#2d2e30", textColor: "#5f6368", darkTextColor: "#9aa0a6", label: "Gris" },
  { color: "#e8eaf6", darkColor: "#1a1f3d", textColor: "#3949ab", darkTextColor: "#9fa8da", label: "Indigo" },
  { color: "#fce4ec", darkColor: "#3b0a1a", textColor: "#c2185b", darkTextColor: "#f48fb1", label: "Rose" },
];

export default function CreateTagModal({ onClose, onCreated }: CreateTagModalProps) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/suggest-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setName(data.name);
      const match = PRESET_COLORS.find((c) => c.label === data.label) ??
        PRESET_COLORS.find((c) => c.color === data.color) ??
        PRESET_COLORS[0];
      setSelectedColor(match);
    } catch {
      setError("Impossible de générer, essaie manuellement.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreate = async () => {
    setError("");
    if (!name.trim()) { setError("Le nom est requis"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          color: selectedColor.color,
          darkColor: selectedColor.darkColor,
          textColor: selectedColor.textColor,
          darkTextColor: selectedColor.darkTextColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onCreated(data.tag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#2d2e30] rounded-2xl shadow-2xl w-[380px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e0e0] dark:border-[#3c4043]">
          <h2 className="text-[15px] font-medium text-[#202124] dark:text-[#e8eaed]">Nouvelle étiquette</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-[#e8eaed] dark:hover:bg-[#3c4043] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6]" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* AI prompt */}
          <div>
            <label className="text-[12px] font-medium text-[#5f6368] dark:text-[#9aa0a6] block mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Décrire à l&apos;IA
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAiGenerate(); }}
                placeholder="Ex: emails urgents de mon notaire..."
                className="flex-1 text-[13px] bg-white dark:bg-[#202124] border border-[#e0e0e0] dark:border-[#3c4043] rounded-lg px-3 py-2 text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] transition-colors placeholder-[#9aa0a6]"
              />
              <button
                onClick={handleAiGenerate}
                disabled={aiLoading || !aiPrompt.trim()}
                className="flex items-center gap-1.5 text-[13px] font-medium bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors flex-shrink-0"
              >
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiLoading ? "" : "Générer"}
              </button>
            </div>
          </div>

          <div className="border-t border-[#e0e0e0] dark:border-[#3c4043]" />

          {/* Name input */}
          <div>
            <label className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] block mb-1.5">Nom de l&apos;étiquette</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="Ex: Prioritaire, Client VIP..."
              autoFocus
              className="w-full text-[14px] bg-white dark:bg-[#202124] border border-[#e0e0e0] dark:border-[#3c4043] rounded-lg px-3 py-2.5 text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#1a73e8] dark:focus:border-[#a8c7fa] transition-colors placeholder-[#9aa0a6]"
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] block mb-2">Couleur</label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedColor(preset)}
                  title={preset.label}
                  className={`h-8 rounded-lg transition-all ${
                    selectedColor.label === preset.label
                      ? "ring-2 ring-offset-1 ring-[#1a73e8] dark:ring-[#a8c7fa] scale-105"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: preset.color, border: `1px solid ${preset.textColor}33` }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          {name.trim() && (
            <div className="flex items-center gap-2 p-3 bg-[#f8f9fa] dark:bg-[#202124] rounded-lg border border-[#e0e0e0] dark:border-[#3c4043]">
              <span
                className="text-[12px] px-2 py-0.5 rounded-sm font-medium"
                style={{ backgroundColor: selectedColor.color, color: selectedColor.textColor }}
              >
                {name.trim()}
              </span>
            </div>
          )}

          {error && <p className="text-[12px] text-[#c5221f] dark:text-[#f28b82]">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e0e0e0] dark:border-[#3c4043]">
          <button
            onClick={onClose}
            className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-[#e8eaed] px-4 py-2 rounded-full hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-40 text-white text-[13px] font-medium px-5 py-2 rounded-full transition-colors"
          >
            {saving ? "Création..." : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}
