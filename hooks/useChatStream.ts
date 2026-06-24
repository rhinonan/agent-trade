"use client";
import { useState, useEffect, useRef, useCallback } from "react";

interface ChatMessage {
  id: string;
  sessionId: string;
  role: "agent" | "user" | "system";
  senderId: string;
  senderName: string;
  content: string;
  metadata: any;
  timestamp: number;
}

export function useChatStream(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"RUNNING" | "PAUSED" | "STOPPED">("RUNNING");
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    // Load initial history
    fetch(`/api/session/${sessionId}/messages?limit=50`)
      .then(r => r.json())
      .then(data => { if (data.messages) setMessages(data.messages); })
      .catch(() => {});

    // Connect SSE
    const es = new EventSource(`/api/session/${sessionId}/messages/stream`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("message", (e) => {
      const msg: ChatMessage = JSON.parse(e.data);
      setMessages(prev => {
        const exists = prev.find(m => m.id === msg.id);
        if (exists) return prev.map(m => m.id === msg.id ? msg : m);
        return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
      });
    });

    es.addEventListener("status-change", (e) => {
      const { status: newStatus } = JSON.parse(e.data);
      setStatus(newStatus);
    });

    return () => { es.close(); };
  }, [sessionId]);

  const sendMessage = useCallback(async (content: string, mentionAgentIds?: string[]) => {
    const res = await fetch(`/api/session/${sessionId}/message`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentionAgentIds }),
    });
    const data = await res.json();
    if (data.messages) {
      setMessages(prev => {
        const existing = new Set(prev.map(m => m.id));
        const newMsgs = data.messages.filter((m: ChatMessage) => !existing.has(m.id));
        return [...prev, ...newMsgs].sort((a, b) => a.timestamp - b.timestamp);
      });
    }
  }, [sessionId]);

  const resumeSession = useCallback(async () => {
    await sendMessage("@director 继续");
  }, [sendMessage]);

  return { messages, status, connected, sendMessage, resumeSession };
}
