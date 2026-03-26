import { NextRequest, NextResponse } from "next/server";
import { addContactNote } from "@/lib/ghl";

export async function POST(req: NextRequest) {
  try {
    const { contactId, body } = await req.json();
    if (!contactId || !body?.trim()) {
      return NextResponse.json({ error: "contactId et body requis" }, { status: 400 });
    }
    const result = await addContactNote(contactId, body.trim());
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
