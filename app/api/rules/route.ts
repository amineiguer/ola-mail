import { NextRequest, NextResponse } from "next/server";
import { getRules, saveRules, Rule } from "@/lib/storage";

export async function GET() {
  const rules = await getRules();
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, conditions, action } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Le nom de la règle est requis" }, { status: 400 });
    }
    if (!Array.isArray(conditions) || conditions.length === 0) {
      return NextResponse.json({ error: "Au moins une condition est requise" }, { status: 400 });
    }
    if (!action || !action.tagId) {
      return NextResponse.json({ error: "L'action (tagId) est requise" }, { status: 400 });
    }

    const rules = await getRules();

    const newRule: Rule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      enabled: true,
      conditions,
      action,
      createdAt: new Date().toISOString(),
    };

    await saveRules([...rules, newRule]);

    return NextResponse.json({ rule: newRule }, { status: 201 });
  } catch (error) {
    console.error("Erreur création règle:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
