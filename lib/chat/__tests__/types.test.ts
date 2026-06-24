import { describe, it, expect } from "vitest";
import type {
  ChatMessage,
  ChatSession,
  DirectorEvent,
  SSEEvent,
  PendingMessage,
  SessionStatus,
  CreateSessionInput,
} from "../types.js";

describe("chat types (compile-time verification)", () => {
  it("SessionStatus accepts valid states", () => {
    const statuses: SessionStatus[] = ["RUNNING", "PAUSED", "STOPPED"];
    expect(statuses).toHaveLength(3);
    expect(statuses).toContain("RUNNING");
    expect(statuses).toContain("PAUSED");
    expect(statuses).toContain("STOPPED");
  });

  it("ChatMessage has required fields", () => {
    const msg: ChatMessage = {
      id: "msg-1",
      sessionId: "session-1",
      role: "agent",
      senderId: "agent-1",
      senderName: "技术分析师",
      content: "这是一个买入信号",
      metadata: {
        type: "analysis",
        stepId: "step-1",
        analysis: {
          conclusion: "买入",
          confidence: 0.85,
          sentiment: "bullish",
          reasoning: ["理由1"],
        },
      },
      timestamp: Date.now(),
    };
    expect(msg.id).toBe("msg-1");
    expect(msg.role).toBe("agent");
    expect(msg.metadata?.type).toBe("analysis");
    expect(msg.metadata?.analysis?.confidence).toBeGreaterThan(0.5);
  });

  it("ChatMessage metadata can be null", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      sessionId: "session-1",
      role: "user",
      senderId: "user-1",
      senderName: "用户",
      content: "你好",
      metadata: null,
      timestamp: Date.now(),
    };
    expect(msg.metadata).toBeNull();
  });

  it("ChatMessage supports all roles", () => {
    const userMsg: ChatMessage = {
      id: "u1", sessionId: "s1", role: "user",
      senderId: "u1", senderName: "用户", content: "hi",
      metadata: null, timestamp: 1,
    };
    const sysMsg: ChatMessage = {
      id: "u2", sessionId: "s1", role: "system",
      senderId: "sys", senderName: "系统", content: "start",
      metadata: null, timestamp: 2,
    };
    expect(userMsg.role).toBe("user");
    expect(sysMsg.role).toBe("system");
  });

  it("PendingMessage omits id, sessionId, timestamp", () => {
    const pending: PendingMessage = {
      role: "agent",
      senderId: "agent-1",
      senderName: "分析师",
      content: "分析结果",
      metadata: { type: "analysis" },
    };
    expect(pending.role).toBe("agent");
    expect((pending as Record<string, unknown>).id).toBeUndefined();
    expect((pending as Record<string, unknown>).sessionId).toBeUndefined();
    expect((pending as Record<string, unknown>).timestamp).toBeUndefined();
  });

  it("ChatSession has required fields", () => {
    const session: ChatSession = {
      id: "session-1",
      target: { type: "stock", code: "600519", name: "贵州茅台" },
      workflowName: "bull-bear",
      status: "RUNNING",
      stepIndex: 0,
      findings: [],
      createdAt: Date.now(),
    };
    expect(session.target.type).toBe("stock");
    expect(session.status).toBe("RUNNING");
    expect(session.findings).toHaveLength(0);
  });

  it("ChatSession status transitions", () => {
    const paused: ChatSession = {
      id: "s1", target: { type: "stock", code: "A" },
      workflowName: "w1", status: "PAUSED",
      stepIndex: 1, findings: [], createdAt: 1,
    };
    const stopped: ChatSession = {
      id: "s2", target: { type: "stock", code: "A" },
      workflowName: "w1", status: "STOPPED",
      stepIndex: 2, findings: [], createdAt: 2,
    };
    expect(paused.status).toBe("PAUSED");
    expect(stopped.status).toBe("STOPPED");
  });

  it("DirectorEvent supports step events", () => {
    const stepStart: DirectorEvent = {
      type: "step-start",
      stepId: "step-1",
      stepType: "analyze",
      agentIds: ["agent-1"],
    };
    expect(stepStart.type).toBe("step-start");
    expect(stepStart.stepId).toBe("step-1");
  });

  it("DirectorEvent supports layer-boundary", () => {
    const layer: DirectorEvent = {
      type: "layer-boundary",
      layer: "layer-1",
    };
    expect(layer.type).toBe("layer-boundary");
    expect(layer.layer).toBe("layer-1");
  });

  it("DirectorEvent supports step-complete", () => {
    const complete: DirectorEvent = {
      type: "step-complete",
      stepId: "step-1",
    };
    expect(complete.type).toBe("step-complete");
  });

  it("SSEEvent holds event name and data", () => {
    const event: SSEEvent = {
      event: "message",
      data: { hello: "world" },
    };
    expect(event.event).toBe("message");
    expect(event.data).toEqual({ hello: "world" });
  });

  it("SSEEvent data can be a string", () => {
    const event: SSEEvent = {
      event: "error",
      data: "something went wrong",
    };
    expect(typeof event.data).toBe("string");
  });

  it("CreateSessionInput has optional fields", () => {
    const input: CreateSessionInput = {
      code: "600519",
      sector: "白酒",
      workflow: "bull-bear",
      provider: "anthropic",
      model: "claude-3-opus",
      userId: "test-user",
    };
    expect(input.code).toBe("600519");
    expect(input.workflow).toBe("bull-bear");
  });

  it("CreateSessionInput can be empty", () => {
    const input: CreateSessionInput = {};
    expect(Object.keys(input)).toHaveLength(0);
  });
});
