import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatSession, CreateSessionInput, SessionStatus } from "./types.js";
import type { ChatRepo } from "../db/chat-repo.js";
import type { SessionRepo } from "../db/session-repo.js";
import type { AgentRegistry } from "../engine/registry.js";
import type { WorkflowDAG, AnalysisTarget, Finding } from "../engine/types.js";
import type { AnalyzeOptions } from "../llm/create-llm.js";
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
    registry: AgentRegistry;
    options: AnalyzeOptions;
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
    _dag: WorkflowDAG,
    registry: AgentRegistry,
    options: AnalyzeOptions = {},
  ): ChatSession {
    const target: AnalysisTarget = input.code
      ? { type: "stock", code: input.code }
      : input.sector ? { type: "sector", code: input.sector }
      : { type: "index", code: input.index! };

    const session: ChatSession = {
      id, target, workflowName: input.workflow ?? "bull-bear",
      status: "RUNNING", stepIndex: 0, findings: [], createdAt: Date.now(),
    };

    const dataClient = new DataClient({ baseUrl: input.dataServiceUrl ?? "http://localhost:9500" });
    this.sessions.set(id, { session, registry, options });

    if (this.sessionRepo) {
      this.sessionRepo.insert({
        id, targetCode: target.code, targetName: null,
        targetType: target.type, workflowName: session.workflowName,
        status: "RUNNING", createdAt: Date.now(),
        userId: input.userId ?? "anonymous",
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

  /** @deprecated Director has been removed. This method is a no-op. */
  startAutoAdvance(_sessionId: string): void {
    // Director has been removed. Session auto-advance is handled by the
    // LangGraph engine via the analyze API endpoint.
  }
}
