"use client";
import { useState } from "react";
import { StructuredAnalysis } from "./StructuredAnalysis.js";

interface MessageBubbleProps {
  role: "agent" | "user";
  senderName: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  timestamp: number;
  defaultExpanded?: boolean;
}

export function MessageBubble({
  role,
  senderName,
  content,
  metadata,
  timestamp,
  defaultExpanded = false,
}: MessageBubbleProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isUser = role === "user";
  const analysis = metadata?.analysis as {
    conclusion: string;
    reasoning?: string[];
    sentiment: "bullish" | "bearish" | "neutral";
    confidence: number;
  } | undefined;

  const sentiment = analysis?.sentiment ?? "neutral";
  const sentimentBorderColor =
    sentiment === "bullish" ? "border-l-emerald-500"
    : sentiment === "bearish" ? "border-l-red-500"
    : "border-l-zinc-500";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] bg-emerald-600/20 border border-emerald-700/40 rounded-2xl rounded-br-sm px-4 py-2.5">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">{content}</p>
          <span className="text-[10px] text-zinc-500 mt-1 block">
            {new Date(timestamp).toLocaleTimeString("zh-CN")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex mb-4">
      <div
        className={`max-w-[80%] bg-zinc-900 rounded-xl border-l-4 ${sentimentBorderColor} px-4 py-3`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-emerald-400">{senderName}</span>
          <span className="text-[10px] text-zinc-600">
            {new Date(timestamp).toLocaleTimeString("zh-CN")}
          </span>
        </div>

        {analysis ? (
          <StructuredAnalysis
            analysis={analysis}
            content={content}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
          />
        ) : (
          <PlainTextContent
            content={content}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
          />
        )}
      </div>
    </div>
  );
}

function PlainTextContent({
  content,
  expanded,
  onToggle,
}: {
  content: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const MAX_CHARS = 120;
  const needsTruncation = content.length > MAX_CHARS;

  return (
    <div onClick={onToggle} className="cursor-pointer">
      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {needsTruncation && !expanded
          ? content.slice(0, MAX_CHARS) + "…"
          : content}
      </p>
      {needsTruncation && (
        <div className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          {expanded ? "点击收起 ▲" : "点击展开 ▼"}
        </div>
      )}
    </div>
  );
}
