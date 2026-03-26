import { NextResponse } from "next/server";

export interface BrandBoard {
  name?: string;
  title?: string;
  phone?: string;
  email?: string;
  logo?: string;
  primaryColor?: string;
  accentColor?: string;
  skyColor?: string;
  primaryFont?: string;
  website?: string;
  brokerage?: string;
  address?: string;
  tagline?: string;
}

const BRANDBOARD_URL = "https://sync.ola-ai.ca/webhook/infolettre";

/** Fetch brand data from the OLA webhook */
export async function GET() {
  try {
    const res = await fetch(BRANDBOARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);

    const payload = await res.json();

    // Handle two response formats:
    // Format A (full): { _id, name, logos, colors, fonts, ... }
    // Format B (list): { brandBoards: [{ name, ... }], totalCount, traceId }
    const board = payload.logos
      ? payload                                                                   // Format A — full data
      : (payload.brandBoards?.[0] ?? payload);                                   // Format B — pick first

    // Extract logo
    const logos: Array<{ url?: string }> = board.logos ?? [];
    const logo = logos[0]?.url ?? board.logo ?? board.logoUrl ?? null;

    // Extract colors by label
    const colors: Array<{ hex?: string; label?: string }> = board.colors ?? [];
    const findColor = (keyword: string) =>
      colors.find((c) => c.label?.toLowerCase().includes(keyword))?.hex;

    const primaryColor = findColor("dark")  ?? colors[2]?.hex ?? null;
    const accentColor  = findColor("light") ?? colors[1]?.hex ?? null;
    const skyColor     = findColor("sky")   ?? colors[0]?.hex ?? null;

    // Extract font
    const fonts: Array<{ font?: string }> = board.fonts ?? [];
    const primaryFont = fonts[0]?.font ?? null;

    const data: BrandBoard = {
      name:         board.name         ?? board.agentName    ?? null,
      title:        board.title        ?? board.agentTitle   ?? null,
      phone:        board.phone        ?? board.agentPhone   ?? null,
      email:        board.email        ?? board.agentEmail   ?? null,
      logo,
      primaryColor,
      accentColor,
      skyColor,
      primaryFont,
      website:      board.website      ?? board.websiteUrl   ?? null,
      brokerage:    board.brokerage    ?? board.brokerageName ?? null,
      address:      board.address      ?? null,
      tagline:      board.tagline      ?? board.slogan       ?? null,
    };

    // Strip null values before returning
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null));
    return NextResponse.json(clean);
  } catch (error) {
    console.error("Erreur récupération brandboard:", error);
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
