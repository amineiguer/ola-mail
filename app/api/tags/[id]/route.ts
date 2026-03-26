import { NextRequest, NextResponse } from "next/server";
import { getCustomTags, saveCustomTags } from "@/lib/storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const customTags = await getCustomTags();
    const filtered = customTags.filter((t) => t.id !== id);

    if (filtered.length === customTags.length) {
      return NextResponse.json({ error: "Étiquette introuvable" }, { status: 404 });
    }

    await saveCustomTags(filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression étiquette:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
