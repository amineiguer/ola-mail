import { NextResponse } from "next/server";
import { getPipelines } from "@/lib/ghl";

export async function GET() {
  try {
    const pipelines = await getPipelines();
    return NextResponse.json({ pipelines });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
