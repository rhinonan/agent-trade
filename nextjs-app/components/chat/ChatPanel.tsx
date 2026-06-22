"use client";
import { useRef, useEffect } from "react";
import { useChatStream } from "@/hooks/useChatStream.js";
import { MessageBubble } from "./MessageBubble.js";
import { SystemMessage } from "./SystemMessage.js";
import { ChatInput } from "./ChatInput.js";
import type { AgentInfo } from "./types.js";

interface ChatPanelProps {
  sessionId: string;
  agents: AgentInfo[];
}

export function ChatPanel({ sessionId, agents }: ChatPanelProps) {
  const { messages, status, connected, sendMessage, resumeSession } = useChatStream(sessionId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isPaused = status === "PAUSED";
  const isStopped = status === "STOPPED";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            status === "RUNNING" ? "bg-emerald-400 animate-pulse"
            : status === "PAUSED" ? "bg-amber-400"
            : "bg-zinc-500"
          }`} />
          <span className="text-sm text-zinc-400">
            {status === "RUNNING" ? "分析进行中..."
             : status === "PAUSED" ? "等待你的输入"
             : "分析完成"}
          </span>
        </div>
        {isPaused && (
          <button
            onClick={resumeSession}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
          >
            继续分析
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map(msg => {
          if (msg.role === "system") {
            return <SystemMessage key={msg.id} content={msg.content} />;
          }
          return (
            <MessageBubble
              key={msg.id}
              role={msg.role as "agent" | "user"}
              senderName={msg.senderName}
              content={msg.content}
              metadata={msg.metadata}
              timestamp={msg.timestamp}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        agents={agents}
        onSend={sendMessage}
        disabled={isStopped}
      />
    </div>
  );
}
