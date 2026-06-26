"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { WISH_STATUS, WISH_STATUS_LABELS, PRESET_TAGS, WISH_SORT_OPTIONS } from "@/lib/wishpool/types.js";

const SORT_LABELS: Record<string, string> = {
  latest: "最新",
  popular: "最热",
  updated: "最近更新",
};

export function WishToolbar({ usedTags }: { usedTags: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  const currentStatus = sp.get("status") ?? "";
  const currentTag = sp.get("tag") ?? "";
  const currentSort = sp.get("sort") ?? "latest";
  const currentQ = sp.get("q") ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page"); // reset pagination on filter change
    router.push(`/wishpool?${next.toString()}`);
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement;
          const input = form.elements.namedItem("q") as HTMLInputElement;
          update("q", input.value);
        }}
        className="flex-1 w-full"
      >
        <Input
          name="q"
          placeholder="搜索心愿..."
          defaultValue={currentQ}
          className="w-full"
        />
      </form>

      {/* Status filter */}
      <select
        value={currentStatus}
        onChange={(e) => update("status", e.target.value)}
        className="h-9 rounded-md border border-zinc-700 bg-transparent px-3 py-1 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
      >
        <option value="" className="bg-zinc-900">全部状态</option>
        {WISH_STATUS.map((s) => (
          <option key={s} value={s} className="bg-zinc-900">
            {WISH_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {/* Tag filter */}
      <select
        value={currentTag}
        onChange={(e) => update("tag", e.target.value)}
        className="h-9 rounded-md border border-zinc-700 bg-transparent px-3 py-1 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
      >
        <option value="" className="bg-zinc-900">全部标签</option>
        {PRESET_TAGS.map((t) => (
          <option key={t} value={t} className="bg-zinc-900">{t}</option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={currentSort}
        onChange={(e) => update("sort", e.target.value)}
        className="h-9 rounded-md border border-zinc-700 bg-transparent px-3 py-1 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
      >
        {WISH_SORT_OPTIONS.map((s) => (
          <option key={s} value={s} className="bg-zinc-900">
            {SORT_LABELS[s]}
          </option>
        ))}
      </select>

      {/* New wish button */}
      <Button onClick={() => router.push("/wishpool/new")} variant="default">
        + 提需求
      </Button>
    </div>
  );
}
