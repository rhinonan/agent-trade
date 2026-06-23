import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatSession, CreateSessionInput, SessionStatus } from "./types.js";
import { Director } from "./director.js";
import type { ChatRepo } from "../db/chat-repo.js";
import type { SessionRepo } from "../db/session-repo.js";
import type { AgentRegistry } from "../engine/registry.js";
import type { WorkflowDAG, AnalysisTarget, Finding } from "../engine/types.js";
import type { AnalyzeOptions } from "../llm/create-llm.js";
import { createLLM } from "../llm/create-llm.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DataClient } from "../data/client.js";

let _instance: SessionManager | undefined;

export function getSessionManager(repo?: ChatRepo, sessionRepo?: SessionRepo): SessionManager {
  if (!_instance) {
    if (!repo) throw new Error("SessionManager not initialized. Pass ChatRepo on first call.");
    _instance = new SessionManager(repo, sessionRepo);
  } else if (sessionRepo) {
    _instance.setSessionRepo(sessionRepo);
  }
  return _instance;
}

export function resetSessionManager(): void {
  _instance = undefined;
}

export class SessionManager {
  private sessions = new Map<string, {
    session: ChatSession;
    director: Director;
    dag: WorkflowDAG;
    registry: AgentRegistry;
    options: AnalyzeOptions;
    _advancing: boolean;
  }>();

  private _sessionRepo?: SessionRepo;

  constructor(private repo: ChatRepo, sessionRepo?: SessionRepo) {
    this._sessionRepo = sessionRepo;
  }

  setSessionRepo(sessionRepo: SessionRepo): void {
    this._sessionRepo = sessionRepo;
  }

  private get sessionRepo(): SessionRepo | undefined {
    return this._sessionRepo;
  }

  createSession(
    id: string,
    input: CreateSessionInput,
    dag: WorkflowDAG,
    registry: AgentRegistry,
    options: AnalyzeOptions = {},
  ): ChatSession {
    const target: AnalysisTarget = input.code
      ? { type: "stock", code: input.code }
      : input.sector ? { type: "sector", code: input.sector }
      : { type: "index", code: input.index! };

    const session: ChatSession = {
      id, target, workflowName: dag.name,
      status: "RUNNING", stepIndex: 0, findings: [], createdAt: Date.now(),
    };

    const dataClient = new DataClient({ baseUrl: input.dataServiceUrl ?? "http://localhost:9500" });
    const director = new Director(dag, options, registry, dataClient);
    this.sessions.set(id, { session, director, dag, registry, options, _advancing: false });

    if (this.sessionRepo) {
      this.sessionRepo.insert({
        id, targetCode: target.code, targetName: null,
        targetType: target.type, workflowName: dag.name,
        status: "RUNNING", createdAt: Date.now(),
      });

      // Fire async lookup for stock name
      if (target.type === "stock") {
        dataClient.reference.get(target.code).then(info => {
          this.sessionRepo?.updateName(id, info.name);
        }).catch(() => {});
      }
    }

    return session;
  }

  getSession(id: string): ChatSession | undefined {
    return this.sessions.get(id)?.session;
  }

  deleteSession(id: string): void {
    if (this.sessionRepo) {
      this.sessionRepo.deleteById(id);
    }
    this.sessions.delete(id);
  }

  getDirector(id: string): Director | undefined {
    return this.sessions.get(id)?.director;
  }

  /** Parse @agent-id mentions from message content */
  private parseMentions(content: string): string[] {
    const matches = content.match(/@([\w-]+)/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1)))];
  }

  async handleUserMessage(
    sessionId: string,
    content: string,
    mentionAgentIds: string[] = [],
  ): Promise<ChatMessage[]> {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`Session ${sessionId} not found`);
    const { session, director, registry } = entry;

    // Merge explicitly passed mentions with parsed @mentions from content
    const parsedMentions = this.parseMentions(content);
    const allMentions = [...new Set([...mentionAgentIds, ...parsedMentions])];

    const now = Date.now();
    const userMsg: ChatMessage = {
      id: randomUUID(), sessionId, role: "user", senderId: "user",
      senderName: "散户", content,
      metadata: allMentions.length > 0
        ? { type: "interjection", mentionAgentIds: allMentions }
        : { type: "interjection" },
      timestamp: now,
    };
    this.repo.insert(userMsg);
    const outMessages: ChatMessage[] = [userMsg];

    // If user @mentioned director, resume the session instead of pausing
    if (allMentions.includes("director")) {
      const resumeMsgs = await this.resumeSession(sessionId);
      outMessages.push(...resumeMsgs);
      return outMessages;
    }

    // If user @mentioned agents, pause director and respond
    if (allMentions.length > 0) {
      director.pause();
      session.status = "PAUSED";

      const history = this.repo.getBySession(sessionId);
      for (const agentId of allMentions) {
        const agent = entry.registry.get(agentId);
        if (!agent) continue;
        const llm = createLLM(entry.options);
        const historyText = history
          .slice(-20)
          .map((h) => `[${h.senderName}]: ${h.content}`)
          .join("\n");

        const response = await llm.invoke([
          new SystemMessage(`你是${agent.name}。立场${agent.personality.stance}。请用中文回复。`),
          new HumanMessage(`${content}\n\n对话历史：\n${historyText}`),
        ]);
        const respText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

        const agentMsg: ChatMessage = {
          id: randomUUID(), sessionId, role: "agent",
          senderId: agentId, senderName: agent.name, content: respText,
          metadata: { type: "interjection", mentionAgentIds: [agentId] },
          timestamp: Date.now(),
        };
        this.repo.insert(agentMsg);
        outMessages.push(agentMsg);
      }
    }

    return outMessages;
  }

  async resumeSession(sessionId: string): Promise<ChatMessage[]> {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`Session ${sessionId} not found`);
    const { session, director, options } = entry;
    director.resume();
    session.status = "RUNNING";

    const outMessages: ChatMessage[] = [];
    const history = this.repo.getBySession(sessionId);

    await director.advance(
      session.target,
      session.findings,
      history.map((h) => ({ senderId: h.senderId, senderName: h.senderName, content: h.content })),
      async (pending) => {
        const msg: ChatMessage = {
          id: randomUUID(), sessionId, ...pending, timestamp: Date.now(),
        };
        this.repo.insert(msg);
        outMessages.push(msg);
      },
    );

    // Restart auto-advance to continue through remaining steps
    this.startAutoAdvance(sessionId);

    return outMessages;
  }

  /** Fire-and-forget: advance through all steps while RUNNING. Stops on PAUSED/STOPPED. */
  startAutoAdvance(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    if (entry._advancing) return; // guard against double-start
    entry._advancing = true;

    const loop = async () => {
      while (true) {
        const e = this.sessions.get(sessionId);
        if (!e || e.director.status !== "RUNNING") break;
        const { session, director } = e;
        const history = this.repo.getBySession(sessionId);
        const result = await director.advance(
          session.target,
          session.findings,
          history.map((h) => ({ senderId: h.senderId, senderName: h.senderName, content: h.content })),
          async (pending) => {
            this.repo.insert({
              id: randomUUID(), sessionId, ...pending, timestamp: Date.now(),
            });
          },
        );
        if (!result.hasMore) {
          session.status = "STOPPED";
          if (this.sessionRepo) this.sessionRepo.updateStatus(sessionId, "STOPPED");
          break;
        }
        // Avoid tight loop — yield to the event loop
        await new Promise((r) => setTimeout(r, 0));
      }
      const current = this.sessions.get(sessionId);
      if (current) current._advancing = false;
    };

    loop().catch((err) => {
      console.error(`Session ${sessionId} auto-advance failed:`, err);
      const e = this.sessions.get(sessionId);
      if (e) {
        e.session.status = "STOPPED";
        if (this.sessionRepo) this.sessionRepo.updateStatus(sessionId, "STOPPED");
        e._advancing = false;
      }
    });
  }
}
