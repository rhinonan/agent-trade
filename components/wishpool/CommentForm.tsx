"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";

export function CommentForm({
  wishId,
  parentId = null,
  onCancel,
}: {
  wishId: string;
  parentId?: string | null;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/wishes/${wishId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim(), parent_id: parentId }),
    });
    if (res.ok) {
      setBody("");
      router.refresh();
      onCancel?.();
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        placeholder={parentId ? "写下你的回复..." : "写下你的评论..."}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={submitting || !body.trim()} size="sm">
          {submitting ? "发表中..." : "发表"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
