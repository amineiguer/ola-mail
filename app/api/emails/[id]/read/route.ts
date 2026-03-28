import { NextRequest, NextResponse } from "next/server";
import { getEmailsCache, saveEmailsCache } from "@/lib/storage";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ghlUserId = req.headers.get("x-ghl-user-id") ?? undefined;
  const { isRead } = await req.json();
  const cache = await getEmailsCache(ghlUserId);
  if (!cache) return NextResponse.json({ error: "Cache vide" }, { status: 404 });

  const updated = cache.map((e) =>
    e.id === params.id ? { ...e, isRead: !!isRead } : e
  );
  await saveEmailsCache(updated, ghlUserId);
  return NextResponse.json({ success: true });
}
