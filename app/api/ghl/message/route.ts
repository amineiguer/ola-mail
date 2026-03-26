import { NextRequest, NextResponse } from "next/server";
import { sendConversationMessage } from "@/lib/ghl";

export async function POST(req: NextRequest) {
  try {
    const { contactId, message, type } = await req.json();
    if (!contactId || !message?.trim()) {
      return NextResponse.json({ error: "contactId et message requis" }, { status: 400 });
    }
    const result = await sendConversationMessage(contactId, message.trim(), type ?? "SMS");
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
