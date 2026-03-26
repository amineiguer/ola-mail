import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/storage";

export async function GET() {
  try {
    const settings = await getSettings();
    // Mask API key for display
    const masked = settings.ghlApiKey
      ? settings.ghlApiKey.slice(0, 6) + "••••••••••••" + settings.ghlApiKey.slice(-4)
      : undefined;
    return NextResponse.json({
      ...settings,
      ghlApiKey: masked,
      ghlConnected: !!(settings.ghlApiKey && settings.ghlLocationId),
    });
  } catch {
    return NextResponse.json({ error: "Erreur lecture settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const patch: Record<string, unknown> = {};

    // Only update ghlApiKey if it's a real value (not the masked one)
    if (body.ghlApiKey !== undefined && !body.ghlApiKey.includes("••")) {
      patch.ghlApiKey = body.ghlApiKey || undefined;
    }
    if (body.ghlLocationId !== undefined) patch.ghlLocationId = body.ghlLocationId || undefined;
    if (body.crmMemberAccess !== undefined) patch.crmMemberAccess = body.crmMemberAccess;

    const updated = await updateSettings(patch);
    return NextResponse.json({
      ...updated,
      ghlApiKey: updated.ghlApiKey
        ? updated.ghlApiKey.slice(0, 6) + "••••••••••••" + updated.ghlApiKey.slice(-4)
        : undefined,
      ghlConnected: !!(updated.ghlApiKey && updated.ghlLocationId),
    });
  } catch {
    return NextResponse.json({ error: "Erreur sauvegarde settings" }, { status: 500 });
  }
}
