import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail";
import { saveTokens } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (error) {
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", error);
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code) {
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl.toString());
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Aucun token d'accès reçu");
    }

    await saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
      token_type: tokens.token_type ?? undefined,
      scope: tokens.scope ?? undefined,
    });

    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("success", "true");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("Erreur lors de l'échange du code OAuth:", err);
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(redirectUrl.toString());
  }
}
