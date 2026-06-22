import { NextResponse } from "next/server";
import { WORKFLOWS } from "@/lib/workflows/index.js";

export async function GET() {
  const list = Object.entries(WORKFLOWS).map(([name, dag]) => ({
    name,
    description: dag.description,
  }));
  return NextResponse.json(list);
}
