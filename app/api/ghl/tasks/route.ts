import { NextRequest, NextResponse } from "next/server";
import { createContactTask } from "@/lib/ghl";

export async function POST(req: NextRequest) {
  try {
    const { contactId, title, dueDate, description } = await req.json();
    if (!contactId || !title?.trim()) {
      return NextResponse.json({ error: "contactId et title requis" }, { status: 400 });
    }
    const result = await createContactTask(contactId, { title: title.trim(), dueDate, description });
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
