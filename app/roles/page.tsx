"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface RoleInfo {
  id: string;
  name: string;
  type: "agent" | "workflow";
  createdAt: number;
}

export default function RolesPage(): React.ReactElement {
  const [tab, setTab] = useState<"agent" | "workflow">("agent");
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    const res = await fetch(`/api/roles?type=${tab}`);
    const data = await res.json();
    setRoles(data.roles);
  }, [tab]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", tab);

    try {
      const res = await fetch("/api/roles", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload failed");
      }
      await fetchRoles();
      e.target.value = "";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/roles/${id}?type=${tab}`, { method: "DELETE" });
    await fetchRoles();
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">角色管理</h1>

      <div className="flex gap-2">
        <Button
          variant={tab === "agent" ? "default" : "outline"}
          onClick={() => setTab("agent")}
        >
          Agent ({roles.length})
        </Button>
        <Button
          variant={tab === "workflow" ? "default" : "outline"}
          onClick={() => setTab("workflow")}
        >
          Workflow
        </Button>
      </div>

      <div className="space-y-2">
        {roles.map((role) => (
          <Card key={role.id} className="p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{role.name}</p>
              <p className="text-sm text-muted-foreground">{role.id}</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(role.id)}
            >
              删除
            </Button>
          </Card>
        ))}
        {roles.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            暂无自定义{tab === "agent" ? "Agent" : "Workflow"}
          </p>
        )}
      </div>

      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          上传 .yaml 文件来创建自定义{tab === "agent" ? "Agent" : "Workflow"}
        </p>
        <Button
          variant="outline"
          disabled={uploading}
          onClick={() => document.getElementById("role-upload")?.click()}
        >
          {uploading ? "上传中..." : "+ 上传新角色"}
        </Button>
        <input
          type="file"
          accept=".yaml,.yml"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
          id="role-upload"
        />
        {error && (
          <p className="text-destructive text-sm mt-2">{error}</p>
        )}
      </div>
    </div>
  );
}
