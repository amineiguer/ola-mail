import { NextRequest, NextResponse } from "next/server";
import { getEmailsCache, saveEmailsCache } from "@/lib/storage";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { isRead } = await req.json();
  const cache = await getEmailsCache();
  if (!cache) return NextResponse.json({ error: "Cache vide" }, { status: 404 });

  const updated = cache.map((e) =>
    e.id === params.id ? { ...e, isRead: !!isRead } : e
  );
  await saveEmailsCache(updated);
  return NextResponse.json({ success: true });
}
