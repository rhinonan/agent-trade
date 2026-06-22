"use client";
import { useState, useRef, useEffect } from "react";
import type { AgentInfo } from "./types.js";

interface ChatInputProps {
  agents: AgentInfo[];
  onSend: (content: string, mentionAgentIds?: string[]) => void;
  disabled?: boolean;
}

export function ChatInput({ agents, onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = agents.filter(a =>
    a.name.includes(pickerQuery) || a.id.includes(pickerQuery)
  );

  function handleSend() {
    if (!value.trim()) return;
    onSend(value.trim(), selectedAgents.length > 0 ? selectedAgents : undefined);
    setValue("");
    setSelectedAgents([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "@") {
      e.preventDefault();
      setShowPicker(true);
      setPickerQuery("");
    }
  }

  function toggleAgent(id: string) {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  }

  return (
    <div className="border-t border-zinc-800 p-4">
      {selectedAgents.length > 0 && (
        <div className="flex gap-1 mb-2 flex-wrap">
          {selectedAgents.map(id => {
            const agent = agents.find(a => a.id === id);
            return (
              <span key={id} className="text-[10px] bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                @{agent?.name ?? id}
                <button onClick={() => toggleAgent(id)} className="hover:text-white">×</button>
              </span>
            );
          })}
        </div>
      )}
      {showPicker && (
        <div className="mb-2 bg-zinc-900 border border-zinc-700 rounded-lg max-h-40 overflow-y-auto">
          <input
            autoFocus
            className="w-full bg-transparent px-3 py-2 text-sm text-zinc-300 outline-none border-b border-zinc-800"
            placeholder="搜索Agent..."
            value={pickerQuery}
            onChange={e => setPickerQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setShowPicker(false); }}
          />
          {filtered.map(a => (
            <button
              key={a.id}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-800 flex items-center justify-between"
              onClick={() => { toggleAgent(a.id); setShowPicker(false); inputRef.current?.focus(); }}
            >
              <span className="text-zinc-300">{a.name}</span>
              <span className="text-[10px] text-zinc-500">{a.layer ?? a.capabilities[0]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，输入 @ 选择Agent..."
          disabled={disabled}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          发送
        </button>
      </div>
    </div>
  );
}
