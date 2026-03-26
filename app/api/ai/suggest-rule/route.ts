import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { description, availableTags } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "Description requise" }, { status: 400 });
  }

  const tagList = (availableTags as { id: string; name: string }[])
    .map((t) => `"${t.id}" (${t.name})`)
    .join(", ");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Tu es un assistant pour un agent immobilier québécois. L'utilisateur veut créer une règle automatique pour ses emails.

Description de la règle: "${description}"

Étiquettes disponibles: ${tagList}

Réponds UNIQUEMENT en JSON valide:
{
  "name": "nom court de la règle (ex: Emails immocontact)",
  "field": "from" | "subject" | "snippet",
  "operator": "contains" | "not_contains" | "equals" | "starts_with",
  "value": "valeur à détecter",
  "tagId": "id de l'étiquette à appliquer (doit être dans la liste)"
}`,
      }],
    });

    const text = (response.content[0] as { type: string; text: string }).text.trim();
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

    const validFields = ["from", "subject", "snippet"];
    const validOps = ["contains", "not_contains", "equals", "starts_with"];
    const validTagIds = (availableTags as { id: string }[]).map((t) => t.id);

    if (!validFields.includes(json.field) || !validOps.includes(json.operator) || !validTagIds.includes(json.tagId)) {
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 422 });
    }

    return NextResponse.json({
      name: json.name ?? description,
      field: json.field,
      operator: json.operator,
      value: json.value ?? "",
      tagId: json.tagId,
    });
  } catch {
    return NextResponse.json({ error: "Erreur IA" }, { status: 500 });
  }
}
