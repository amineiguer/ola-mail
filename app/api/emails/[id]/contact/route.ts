import { NextRequest, NextResponse } from "next/server";
import { getEmailsCache, updateEmailLinkedContact } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ghlUserId = _req.headers.get("x-ghl-user-id") ?? undefined;
  const emails = await getEmailsCache(ghlUserId);
  const email = emails?.find((e) => e.id === params.id);
  if (!email) return NextResponse.json({ error: "Email introuvable" }, { status: 404 });
  return NextResponse.json({ linkedContact: email.linkedContact ?? null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ghlUserId = req.headers.get("x-ghl-user-id") ?? undefined;
    const { contact } = await req.json();
    if (!contact?.id || !contact?.name) {
      return NextResponse.json({ error: "contact.id et contact.name requis" }, { status: 400 });
    }
    await updateEmailLinkedContact(params.id, {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
    }, ghlUserId);
    return NextResponse.json({ success: true, linkedContact: contact });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ghlUserId = _req.headers.get("x-ghl-user-id") ?? undefined;
    await updateEmailLinkedContact(params.id, null, ghlUserId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
