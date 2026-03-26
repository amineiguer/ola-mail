import { NextRequest, NextResponse } from "next/server";
import { searchContacts, createContact } from "@/lib/ghl";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ contacts: [] });

  try {
    const contacts = await searchContacts(q.trim());
    return NextResponse.json({ contacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contact = await createContact({
      firstName: body.firstName,
      lastName: body.lastName,
      name: body.name,
      email: body.email,
      phone: body.phone,
      tags: body.tags,
    });
    return NextResponse.json({ contact });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
