import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = new AnalysisRepo(getDb());
  const record = repo.getById(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    sessionId: record.id,
    status: record.status,
    target: { code: record.targetCode, name: record.targetName, type: record.targetType },
    workflow: record.workflowName,
    context: JSON.parse(record.context),
    createdAt: record.createdAt,
  });
}
