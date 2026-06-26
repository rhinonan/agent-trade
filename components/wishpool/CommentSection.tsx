import { CommentForm } from "./CommentForm.js";
import { CommentItem } from "./CommentItem.js";
import type { CommentTree } from "@/lib/wishpool/types.js";

export function CommentSection({
  wishId,
  comments,
}: {
  wishId: string;
  comments: CommentTree[];
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-zinc-300">
        评论 ({comments.reduce((sum, c) => sum + 1 + c.replies.length, 0)})
      </h3>

      {/* Top-level comment form */}
      <CommentForm wishId={wishId} />

      {/* Comment tree */}
      {comments.length > 0 ? (
        <div className="space-y-6">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} wishId={wishId} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">暂无评论，来发表第一条吧。</p>
      )}
    </div>
  );
}
