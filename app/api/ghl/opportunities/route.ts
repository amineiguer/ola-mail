import { NextRequest, NextResponse } from "next/server";
import { createOpportunity } from "@/lib/ghl";

export async function POST(req: NextRequest) {
  try {
    const { name, pipelineId, stageId, contactId, monetaryValue } = await req.json();
    if (!name?.trim() || !pipelineId || !stageId) {
      return NextResponse.json({ error: "name, pipelineId et stageId requis" }, { status: 400 });
    }
    const result = await createOpportunity({
      name: name.trim(),
      pipelineId,
      stageId,
      contactId,
      monetaryValue: monetaryValue ? Number(monetaryValue) : undefined,
    });
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
