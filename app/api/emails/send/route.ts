import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuthClient } from "@/lib/gmail";
import { getTokens } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const { to, subject, body, bodyHtml, threadId, inReplyTo, references } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Champs requis: to, subject, body" }, { status: 400 });
    }

    const ghlUserId =
      request.headers.get("x-ghl-user-id") ??
      request.cookies.get("ola_session")?.value ??
      undefined;
    const tokens = await getTokens(ghlUserId);
    if (!tokens?.access_token) {
      return NextResponse.json({ error: "Non connecté à Gmail" }, { status: 401 });
    }

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    let raw: string;

    if (bodyHtml) {
      // Build multipart/alternative with both plain text and HTML
      const boundary = `boundary_${Date.now()}_ola`;
      const headers = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ];
      if (inReplyTo)  headers.push(`In-Reply-To: ${inReplyTo}`);
      if (references) headers.push(`References: ${references}`);

      const plainB64 = Buffer.from(body, "utf-8").toString("base64");
      const htmlB64  = Buffer.from(bodyHtml, "utf-8").toString("base64");

      const mime = [
        ...headers,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        plainB64,
        "",
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        htmlB64,
        "",
        `--${boundary}--`,
      ].join("\r\n");

      raw = Buffer.from(mime)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    } else {
      // Plain text only
      const messageParts = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
      ];
      if (inReplyTo)  messageParts.push(`In-Reply-To: ${inReplyTo}`);
      if (references) messageParts.push(`References: ${references}`);
      messageParts.push("", body);

      raw = Buffer.from(messageParts.join("\r\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    const sendParams: { userId: string; requestBody: { raw: string; threadId?: string } } = {
      userId: "me",
      requestBody: { raw },
    };
    if (threadId) sendParams.requestBody.threadId = threadId;

    await gmail.users.messages.send(sendParams);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur envoi email:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'email" },
      { status: 500 }
    );
  }
}
