// app/wishpool/page.tsx
import { listWishes, getUsedTags } from "@/lib/wishpool/repo.js";
import { wishFiltersSchema } from "@/lib/wishpool/types.js";
import { WishCard } from "@/components/wishpool/WishCard.js";
import { WishToolbar } from "@/components/wishpool/WishToolbar.js";
import { headers } from "next/headers";
import Link from "next/link";

const PAGE_SIZE = 20;

export default async function WishpoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const parsed = wishFiltersSchema.safeParse({
    status: sp.status,
    tag: sp.tag,
    q: sp.q,
    sort: sp.sort,
    page: sp.page,
  });

  const filters = parsed.success ? parsed.data : { sort: "latest" as const, page: 0 };
  const headersList = await headers();
  const userId = headersList.get("x-user-id") ?? "anonymous";
  const { items, total, page } = listWishes(filters, userId);
  const usedTags = getUsedTags();
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-200">许愿池</h1>
        <span className="text-xs text-zinc-500">{total} 个心愿</span>
      </div>

      <WishToolbar usedTags={usedTags} />

      {items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-zinc-500">没有找到匹配的心愿</p>
          {filters.q || filters.status || filters.tag ? (
            <Link href="/wishpool" className="text-sm text-blue-400 hover:underline">
              清除过滤条件
            </Link>
          ) : (
            <Link
              href="/wishpool/new"
              className="inline-block text-sm text-blue-400 hover:underline"
            >
              去提第一个需求 →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((wish) => (
            <WishCard key={wish.id} wish={wish} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6">
          {page > 0 && (
            <Link
              href={`/wishpool?${new URLSearchParams({ ...sp as Record<string,string>, page: String(page - 1) }).toString()}`}
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              ← 上一页
            </Link>
          )}
          <span className="text-sm text-zinc-500">
            {page + 1} / {totalPages}
          </span>
          {page < totalPages - 1 && (
            <Link
              href={`/wishpool?${new URLSearchParams({ ...sp as Record<string,string>, page: String(page + 1) }).toString()}`}
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              下一页 →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
