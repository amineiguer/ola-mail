import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const COLORS = [
  { label: "Bleu",    color: "#e8f0fe", darkColor: "#1a2744", textColor: "#1a73e8", darkTextColor: "#a8c7fa" },
  { label: "Vert",    color: "#e6f4ea", darkColor: "#1e3a2f", textColor: "#137333", darkTextColor: "#81c995" },
  { label: "Rouge",   color: "#fce8e6", darkColor: "#3b1f1e", textColor: "#c5221f", darkTextColor: "#f28b82" },
  { label: "Jaune",   color: "#fef7e0", darkColor: "#3a2f00", textColor: "#b06000", darkTextColor: "#fdd663" },
  { label: "Violet",  color: "#f3e8fd", darkColor: "#2a1a3a", textColor: "#7b1fa2", darkTextColor: "#ce93d8" },
  { label: "Cyan",    color: "#e0f7fa", darkColor: "#002d30", textColor: "#00695c", darkTextColor: "#80cbc4" },
  { label: "Orange",  color: "#fff3e0", darkColor: "#3a1f00", textColor: "#e65100", darkTextColor: "#ffcc80" },
  { label: "Gris",    color: "#f1f3f4", darkColor: "#2d2e30", textColor: "#5f6368", darkTextColor: "#9aa0a6" },
  { label: "Indigo",  color: "#e8eaf6", darkColor: "#1a1f3d", textColor: "#3949ab", darkTextColor: "#9fa8da" },
  { label: "Rose",    color: "#fce4ec", darkColor: "#3b0a1a", textColor: "#c2185b", darkTextColor: "#f48fb1" },
];

export async function POST(req: Request) {
  const { description } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "Description requise" }, { status: 400 });
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Tu es un assistant pour un agent immobilier québécois. L'utilisateur veut créer une étiquette email.

Description: "${description}"

Réponds UNIQUEMENT en JSON valide:
{
  "name": "nom court de l'étiquette (max 20 caractères, en français)",
  "color": "une de ces couleurs: Bleu, Vert, Rouge, Jaune, Violet, Cyan, Orange, Gris, Indigo, Rose"
}`,
      }],
    });

    const text = (response.content[0] as { type: string; text: string }).text.trim();
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const colorMatch = COLORS.find((c) => c.label.toLowerCase() === (json.color ?? "").toLowerCase()) ?? COLORS[0];

    return NextResponse.json({
      name: (json.name ?? description).substring(0, 20),
      ...colorMatch,
    });
  } catch {
    return NextResponse.json({ error: "Erreur IA" }, { status: 500 });
  }
}
