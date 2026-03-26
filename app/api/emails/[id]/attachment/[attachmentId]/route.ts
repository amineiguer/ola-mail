import { NextResponse } from "next/server";
import { getTokens } from "@/lib/storage";
import { getAuthenticatedClient, getAttachment } from "@/lib/gmail";

export async function GET(
  _req: Request,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const ghlUserId = _req.headers.get("x-ghl-user-id") ?? undefined;
  const tokens = await getTokens(ghlUserId);
  if (!tokens?.access_token) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id: emailId, attachmentId } = params;
  if (!emailId || !attachmentId) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  try {
    const authClient = await getAuthenticatedClient(tokens);
    const buffer = await getAttachment(authClient, emailId, attachmentId);

    if (!buffer) {
      return NextResponse.json({ error: "Pièce jointe introuvable" }, { status: 404 });
    }

    // Detect MIME from query param (passed by the client)
    const mimeType =
      new URL(_req.url).searchParams.get("mime") ?? "application/octet-stream";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
