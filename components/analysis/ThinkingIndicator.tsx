"use client";

/**
 * Three bouncing dots indicating an agent is "thinking".
 * Chat-bubble style — mimics ChatGPT/Claude's typing indicator.
 */
export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-3 px-4" aria-label="Agent is thinking">
      <span className="dot-typing-bounce w-2 h-2 bg-zinc-500 rounded-full" />
      <span className="dot-typing-bounce w-2 h-2 bg-zinc-500 rounded-full" style={{ animationDelay: "0.2s" }} />
      <span className="dot-typing-bounce w-2 h-2 bg-zinc-500 rounded-full" style={{ animationDelay: "0.4s" }} />
    </div>
  );
}
