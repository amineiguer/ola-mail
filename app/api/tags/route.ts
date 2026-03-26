import { NextRequest, NextResponse } from "next/server";
import { PREDEFINED_TAGS } from "@/lib/tags-config";
import { getCustomTags, saveCustomTags, CustomTag } from "@/lib/storage";

export async function GET() {
  const customTags = await getCustomTags();
  return NextResponse.json({ predefined: PREDEFINED_TAGS, custom: customTags });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color, darkColor, textColor, darkTextColor } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Le nom de l'étiquette est requis" }, { status: 400 });
    }

    const customTags = await getCustomTags();

    const newTag: CustomTag = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      color: color || "#f1f3f4",
      darkColor: darkColor || "#2d2e30",
      textColor: textColor || "#5f6368",
      darkTextColor: darkTextColor || "#9aa0a6",
      group: "custom",
      isPredefined: false,
      createdAt: new Date().toISOString(),
    };

    await saveCustomTags([...customTags, newTag]);

    return NextResponse.json({ tag: newTag }, { status: 201 });
  } catch (error) {
    console.error("Erreur création étiquette:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
