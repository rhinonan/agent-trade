// app/wishpool/[id]/page.tsx
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getWish, getComments } from "@/lib/wishpool/repo.js";
import { statusLabel, statusColor } from "@/lib/wishpool/utils.js";
import { Badge } from "@/components/ui/badge.js";
import { ReactionBar } from "@/components/wishpool/ReactionBar.js";
import { CommentSection } from "@/components/wishpool/CommentSection.js";
import { formatRelativeTime } from "@/lib/utils.js";

export default async function WishDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const headersList = await headers();
  const userId = headersList.get("x-user-id") ?? "anonymous";
  const wish = getWish(id, userId);

  if (!wish) notFound();

  const comments = getComments(id);

  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] max-w-3xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {wish.pinned === 1 && <span className="text-amber-400">📌</span>}
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(wish.status)}`}
          >
            {statusLabel(wish.status)}
          </span>
        </div>
        <h1 className="text-xl font-bold text-zinc-100">{wish.title}</h1>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{wish.author_name}</span>
          <span>发布于 {formatRelativeTime(wish.created_at)}</span>
          {wish.updated_at !== wish.created_at && (
            <span>更新于 {formatRelativeTime(wish.updated_at)}</span>
          )}
        </div>
      </div>

      {/* Tags */}
      {wish.tags.length > 0 && (
        <div className="flex items-center gap-2">
          {wish.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Body */}
      {wish.body && (
        <div className="prose prose-invert prose-sm max-w-none border border-zinc-800 rounded-lg p-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{wish.body}</ReactMarkdown>
        </div>
      )}

      {/* Reaction bar */}
      <ReactionBar wishId={wish.id} reactions={wish.reactions} />

      <hr className="border-zinc-800" />

      {/* Comments */}
      <CommentSection wishId={wish.id} comments={comments} />
    </main>
  );
}
