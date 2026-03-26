import { NextResponse } from "next/server";
import { getLabels, getAuthenticatedClient } from "@/lib/gmail";
import { getTokens } from "@/lib/storage";

export async function GET() {
  const tokens = await getTokens();
  if (!tokens?.access_token) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const authClient = await getAuthenticatedClient(tokens);
    const labels = await getLabels(authClient);

    // Sort: user labels first, then system labels
    const sorted = labels.sort((a, b) => {
      if (a.type === "user" && b.type !== "user") return -1;
      if (a.type !== "user" && b.type === "user") return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ labels: sorted });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
