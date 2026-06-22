export function SystemMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-center mb-4">
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-full px-4 py-1.5">
        <span className="text-xs text-zinc-500">{content}</span>
      </div>
    </div>
  );
}
