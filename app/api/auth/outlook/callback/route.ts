import { NextRequest, NextResponse } from "next/server";
import { exchangeOutlookCode, getOutlookUserEmail } from "@/lib/outlook";
import { saveOutlookTokens } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (error) {
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", error);
    redirectUrl.searchParams.set("provider", "outlook");
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code) {
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", "missing_code");
    redirectUrl.searchParams.set("provider", "outlook");
    return NextResponse.redirect(redirectUrl.toString());
  }

  const state = searchParams.get("state");
  const ghlUserId = state ? decodeURIComponent(state) : undefined;

  try {
    const tokens = await exchangeOutlookCode(code);

    // Get user email
    let email: string | undefined;
    try {
      email = await getOutlookUserEmail(tokens.access_token);
    } catch { /* non-critical */ }

    if (ghlUserId) {
      await saveOutlookTokens({ ...tokens, email }, ghlUserId);
    }

    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("success", "true");
    redirectUrl.searchParams.set("provider", "outlook");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("Erreur échange code OAuth Outlook:", err);
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", "token_exchange_failed");
    redirectUrl.searchParams.set("provider", "outlook");
    return NextResponse.redirect(redirectUrl.toString());
  }
}
