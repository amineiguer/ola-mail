import { NextResponse } from "next/server";
import { getSettings } from "@/lib/storage";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export async function GET() {
  try {
    // Prefer env vars, fallback to settings.json
    const settings = await getSettings();
    const apiKey = process.env.GHL_API_KEY || settings.ghlApiKey;
    const locationId = process.env.GHL_LOCATION_ID || settings.ghlLocationId;

    if (!apiKey || !locationId) {
      return NextResponse.json({ error: "GHL non configuré" }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_API_VERSION,
      "Content-Type": "application/json",
    };

    // Fetch current user
    const userRes = await fetch(`${GHL_API_BASE}/users/me`, { headers });

    if (!userRes.ok) {
      const err = await userRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Erreur API GHL: ${JSON.stringify(err)}` },
        { status: userRes.status }
      );
    }

    const userData = await userRes.json();
    const user = userData.user ?? userData;

    // Fetch location info to enrich context
    let location: Record<string, unknown> | null = null;
    try {
      const locRes = await fetch(`${GHL_API_BASE}/locations/${locationId}`, { headers });
      if (locRes.ok) {
        const locData = await locRes.json();
        location = locData.location ?? locData;
      }
    } catch {
      // non-blocking
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name ?? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        profilePhoto: user.profilePhoto,
        role: user.roles?.[0]?.type ?? user.role ?? "user",
      },
      location: location
        ? {
            id: (location.id as string) ?? locationId,
            name: (location.name as string) ?? "",
            phone: location.phone as string | undefined,
            email: location.email as string | undefined,
            address: location.address as string | undefined,
            city: location.city as string | undefined,
            timezone: location.timezone as string | undefined,
          }
        : { id: locationId },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur GHL inconnue" },
      { status: 500 }
    );
  }
}
