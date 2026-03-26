import { NextRequest, NextResponse } from "next/server";
import { getRules, saveRules } from "@/lib/storage";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const rules = await getRules();
    const ruleIndex = rules.findIndex((r) => r.id === id);

    if (ruleIndex === -1) {
      return NextResponse.json({ error: "Règle introuvable" }, { status: 404 });
    }

    // Toggle enabled or update fields
    const updatedRule = {
      ...rules[ruleIndex],
      ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
      ...(body.name ? { name: body.name } : {}),
      ...(body.conditions ? { conditions: body.conditions } : {}),
      ...(body.action ? { action: body.action } : {}),
    };

    const updatedRules = [...rules];
    updatedRules[ruleIndex] = updatedRule;
    await saveRules(updatedRules);

    return NextResponse.json({ rule: updatedRule });
  } catch (error) {
    console.error("Erreur mise à jour règle:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const rules = await getRules();
    const filtered = rules.filter((r) => r.id !== id);

    if (filtered.length === rules.length) {
      return NextResponse.json({ error: "Règle introuvable" }, { status: 404 });
    }

    await saveRules(filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression règle:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
