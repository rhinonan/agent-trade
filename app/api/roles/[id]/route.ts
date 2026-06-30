// app/api/roles/[id]/route.ts

/**
 * 角色删除接口 — DELETE /api/roles/[id]
 *
 * 按复合键 (id + userId + type) 查找并删除用户上传的角色。
 * 未找到返回 404，删除成功返回 200。
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { RoleRepo } from "@/lib/role-loader/repo.js";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const type = req.nextUrl.searchParams.get("type") ?? "agent";

  const repo = new RoleRepo(getDb());
  // 复合键查找：id + userId + type
  const existing = repo.getById(id, userId, type as "agent" | "workflow");

  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  repo.delete(id, userId, type as "agent" | "workflow");
  return NextResponse.json({ deleted: true });
}
