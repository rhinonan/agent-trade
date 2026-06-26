"use client";

import { useState } from "react";
import { formatRelativeTime } from "@/lib/utils.js";
import { CommentForm } from "./CommentForm.js";
import type { CommentTree } from "@/lib/wishpool/types.js";

export function CommentItem({
  comment,
  wishId,
}: {
  comment: CommentTree;
  wishId: string;
}) {
  const [showReply, setShowReply] = useState(false);

  return (
    <div className="space-y-3">
      {/* Main comment */}
      <div className="border-l-2 border-zinc-800 pl-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <span className="text-zinc-400 font-medium">{comment.author_name}</span>
          <span>{formatRelativeTime(comment.created_at)}</span>
        </div>
        <div className="text-sm text-zinc-300 whitespace-pre-wrap">{comment.body}</div>
        <button
          onClick={() => setShowReply(!showReply)}
          className="text-xs text-zinc-500 hover:text-zinc-300 mt-2 transition-colors"
        >
          {showReply ? "取消回复" : "回复"}
        </button>
      </div>

      {/* Inline reply form */}
      {showReply && (
        <div className="ml-6">
          <CommentForm
            wishId={wishId}
            parentId={comment.id}
            onCancel={() => setShowReply(false)}
          />
        </div>
      )}

      {/* Nested replies */}
      {comment.replies.length > 0 && (
        <div className="ml-6 space-y-3 border-l border-zinc-800/50 pl-4">
          {comment.replies.map((reply) => (
            <div key={reply.id}>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                <span className="text-zinc-400 font-medium">{reply.author_name}</span>
                <span>{formatRelativeTime(reply.created_at)}</span>
              </div>
              <div className="text-sm text-zinc-300 whitespace-pre-wrap">{reply.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
