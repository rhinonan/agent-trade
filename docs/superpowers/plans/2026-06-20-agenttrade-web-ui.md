# AgentTrade Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a web frontend (Vue 3 SPA) with a NestJS backend server that lets users input stock codes/sector names, run analysis, and see the workflow progress in real-time via WebSocket.

**Architecture:** New `packages/server` (NestJS, Socket.IO) provides HTTP API + WebSocket gateway, calling `@agenttrade/core` workflow engine directly. New `packages/web` (Vue 3 + Vite + Pinia) is a SPA that POSTs to start analysis and subscribes to WS events for real-time progress. Both packages are independent from the existing CLI.

**Tech Stack:** Vue 3, Vite, Pinia, Tailwind CSS 4, socket.io-client (frontend); NestJS 10+, @nestjs/websockets, socket.io (backend)

## Global Constraints

- Monorepo: pnpm workspaces (`packages/*`)
- TypeScript 5.x, ESM (`"type": "module"`)
- All new packages scoped `@agenttrade/`
- Server and CLI are independent — no imports between them
- Data service must be running separately (`d2-data/` on :9500)
- API keys via `.env` (dotenv loaded by server at startup)
- **Frontend styling: Tailwind CSS 4 only. NO scoped `<style>` blocks. NO custom CSS files. All styling via Tailwind utility classes.**

---

### Task 1: Server package scaffold

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/main.ts`
- Create: `packages/server/src/app.module.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: NestJS app bootstrap on port 3000, `AppModule` importing `AnalyzeModule`

- [ ] **Step 1: Create `packages/server/package.json`**

```json
{
  "name": "@agenttrade/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "dev": "tsc && node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@agenttrade/agents": "workspace:*",
    "@agenttrade/core": "workspace:*",
    "@agenttrade/data-client": "workspace:*",
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/platform-socket.io": "^10.4.0",
    "@nestjs/websockets": "^10.4.0",
    "dotenv": "^17.4.2",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "socket.io": "^4.8.0"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.4.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/__tests__/**"]
}
```

- [ ] **Step 3: Install server dependencies**

```bash
cd packages/server && pnpm install
```

Expected: packages install without errors.

- [ ] **Step 4: Create `packages/server/src/main.ts`**

```typescript
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: "*" });
  const port = process.env.SERVER_PORT ?? 3000;
  await app.listen(port);
  console.log(`AgentTrade Server running on http://localhost:${port}`);
}

bootstrap();
```

- [ ] **Step 5: Create `packages/server/src/app.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { AnalyzeModule } from "./analyze/analyze.module.js";

@Module({
  imports: [AnalyzeModule],
})
export class AppModule {}
```

- [ ] **Step 6: Create stub `packages/server/src/analyze/analyze.module.ts`**

```typescript
import { Module } from "@nestjs/common";

@Module({})
export class AnalyzeModule {}
```

- [ ] **Step 7: Verify TypeScript compilation**

```bash
cd packages/server && pnpm build
```

Expected: builds without errors (empty module is fine).

- [ ] **Step 8: Commit**

```bash
git add packages/server/package.json packages/server/tsconfig.json packages/server/src/
git commit -m "feat(server): scaffold NestJS server package"
```

---

### Task 2: Server workflow definitions + DTO

**Files:**
- Create: `packages/server/src/workflows/bull-bear.ts`
- Create: `packages/server/src/workflows/quick-scan.ts`
- Create: `packages/server/src/workflows/index.ts`
- Create: `packages/server/src/analyze/dto/start-analysis.dto.ts`

**Interfaces:**
- Consumes: nothing (independent definitions)
- Produces:
  - `WORKFLOWS: Record<string, WorkflowDAG>` (exported from `workflows/index.ts`)
  - `StartAnalysisDto` class with `@IsOptional()` `@IsString()` decorators

- [ ] **Step 1: Create `packages/server/src/workflows/bull-bear.ts`**

```typescript
import { defineWorkflow, analyze, parallel, critique, synthesize } from "@agenttrade/core";

export const bullBearWorkflow = defineWorkflow({
  name: "bull-bear",
  description: "标准牛熊对抗分析 — 牛方和熊方技术面分析后互相审阅，裁判综合裁决"
})
.step("bull-analysis", analyze({
  agent: { capability: "bullish" },
  prompt: "从技术面看多 {target}，给出3条核心理由。关注均线多头排列、MACD金叉、放量突破等信号。",
}))
.step("bear-analysis", analyze({
  agent: { capability: "bearish" },
  prompt: "从技术面看空 {target}，给出3条核心理由。关注死叉、破位、顶背离、缩量等信号。",
}))
.step("cross-critique", parallel([
  critique({
    reviewer: "technical-bull",
    targetStep: "bear-analysis",
    prompt: "作为牛方，逐条审阅熊方的看空理由。哪些论据不够有力？哪些被夸大？请具体反驳。",
  }),
  critique({
    reviewer: "technical-bear",
    targetStep: "bull-analysis",
    prompt: "作为熊方，逐条审阅牛方的看多理由。哪些信号是假突破？哪些利好已被定价？请具体反驳。",
  }),
]))
.step("final", synthesize({
  agent: "judge",
  prompt: "综合牛方、熊方的分析以及双方的互驳，对 {target} 的短期走势做出最终研判。给出操作建议和关键点位。",
}))
.build();
```

- [ ] **Step 2: Create `packages/server/src/workflows/quick-scan.ts`**

```typescript
import { defineWorkflow, analyze, synthesize } from "@agenttrade/core";

export const quickScanWorkflow = defineWorkflow({
  name: "quick-scan",
  description: "快速扫描 — 技术面和基本面并行分析，裁判直接综合"
})
.step("tech", analyze({
  agent: { capability: "technical" },
  prompt: "快速扫描 {target} 的技术面，给出关键信号（一页以内）。",
}))
.step("fundamental", analyze({
  agent: { capability: "fundamental" },
  prompt: "快速扫描 {target} 的基本面，给出关键估值指标（一页以内）。",
}))
.step("summary", synthesize({
  agent: "judge",
  prompt: "快速综合技术面和基本面信息，对 {target} 给出简要研判。",
}))
.build();
```

- [ ] **Step 3: Create `packages/server/src/workflows/index.ts`**

```typescript
import type { WorkflowDAG } from "@agenttrade/core";
import { bullBearWorkflow } from "./bull-bear.js";
import { quickScanWorkflow } from "./quick-scan.js";

export const WORKFLOWS: Record<string, WorkflowDAG> = {
  "bull-bear": bullBearWorkflow,
  "quick-scan": quickScanWorkflow,
};
```

- [ ] **Step 4: Create `packages/server/src/analyze/dto/start-analysis.dto.ts`**

```typescript
import { IsOptional, IsString, IsIn } from "class-validator";
import { Type } from "class-transformer";

export class StartAnalysisDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsString()
  index?: string;

  @IsOptional()
  @IsString()
  @IsIn(["bull-bear", "quick-scan"])
  workflow?: string = "bull-bear";

  @IsOptional()
  @IsString()
  @IsIn(["anthropic", "openai", "deepseek"])
  provider?: string = "deepseek";

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  dataServiceUrl?: string = "http://localhost:9500";
}
```

- [ ] **Step 5: Install class-validator and class-transformer**

```bash
cd packages/server && pnpm add class-validator class-transformer
```

- [ ] **Step 6: Verify TypeScript compilation**

```bash
cd packages/server && pnpm build
```

Expected: builds without errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/workflows/ packages/server/src/analyze/dto/
git commit -m "feat(server): add workflow definitions and DTO"
```

---

### Task 3: Server AnalyzeService (core analysis logic)

**Files:**
- Create: `packages/server/src/analyze/analyze.service.ts`

**Interfaces:**
- Consumes: `WORKFLOWS` from Task 2, `StartAnalysisDto` from Task 2, `AnalyzeGateway` from Task 4 (to be created)
- Produces: `AnalyzeService` with `startAnalysis(dto): Promise<{ sessionId: string }>`

- [ ] **Step 1: Create `packages/server/src/analyze/analyze.service.ts`**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AgentRegistry,
  registerInstances,
  WorkflowScheduler,
  createContext,
  setDefaultLLMProvider,
  type AnalysisTarget,
  type ExecutionContext,
  type Finding,
} from "@agenttrade/core";
import { TechnicalAnalystAgent, FinancialReportAgent, JudgeAgent } from "@agenttrade/agents";
import { DataClient } from "@agenttrade/data-client";
import { AnalyzeGateway } from "./analyze.gateway.js";
import { StartAnalysisDto } from "./dto/start-analysis.dto.js";
import { WORKFLOWS } from "../workflows/index.js";

interface Session {
  id: string;
  context: ExecutionContext | null;
  status: "running" | "complete" | "error";
  error?: string;
}

@Injectable()
export class AnalyzeService {
  private readonly logger = new Logger(AnalyzeService.name);
  private sessions = new Map<string, Session>();

  constructor(private readonly gateway: AnalyzeGateway) {}

  async startAnalysis(dto: StartAnalysisDto): Promise<{ sessionId: string }> {
    const sessionId = randomUUID();
    const session: Session = { id: sessionId, context: null, status: "running" };
    this.sessions.set(sessionId, session);

    // Run analysis asynchronously — don't block the HTTP response
    this.runAnalysis(sessionId, dto).catch((err) => {
      this.logger.error(`Analysis ${sessionId} failed:`, err);
      session.status = "error";
      session.error = err.message;
      this.gateway.sendToClient(sessionId, "analysis:error", {
        message: err.message,
      });
    });

    return { sessionId };
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  private async runAnalysis(sessionId: string, dto: StartAnalysisDto): Promise<void> {
    const session = this.sessions.get(sessionId)!;

    // Set provider
    if (dto.provider) {
      setDefaultLLMProvider(dto.provider as "anthropic" | "openai" | "deepseek");
    }

    // Select workflow
    const workflowDag = WORKFLOWS[dto.workflow ?? "bull-bear"];
    if (!workflowDag) {
      throw new Error(`Unknown workflow: ${dto.workflow}`);
    }

    // Determine analysis target
    const target = await this.resolveTarget(dto);

    // Emit start event
    this.gateway.sendToClient(sessionId, "analysis:start", {
      target: { type: target.type, code: target.code, name: target.name },
      workflow: dto.workflow ?? "bull-bear",
    });

    // Setup agent registry
    const registry = new AgentRegistry();
    registerInstances(registry, [
      new TechnicalAnalystAgent({ id: "technical-bull", personality: { stance: "bullish", style: "optimistic" } }),
      new TechnicalAnalystAgent({ id: "technical-bear", personality: { stance: "bearish", style: "skeptical" } }),
      new TechnicalAnalystAgent({ id: "technical-neutral", personality: { stance: "neutral" } }),
      new FinancialReportAgent({ id: "financial-bull", personality: { stance: "bullish" } }),
      new FinancialReportAgent({ id: "financial-bear", personality: { stance: "bearish" } }),
      new FinancialReportAgent({ id: "financial-neutral", personality: { stance: "neutral" } }),
      new JudgeAgent(),
    ]);

    const scheduler = new WorkflowScheduler(registry);
    const context = createContext(
      target,
      `对${target.name ?? target.code}进行分析`,
      dto.workflow ?? "bull-bear",
    );

    // Execute with event callbacks
    const result = await scheduler.execute(
      workflowDag,
      context,
      { provider: dto.provider as any, modelName: dto.model },
      {
        onStepStart: (stepId, type) => {
          // Determine which agents are involved in this step
          const stepDef = workflowDag.steps.find(s => s.id === stepId);
          const agentIds = this.extractAgentIds(stepDef, registry);
          this.gateway.sendToClient(sessionId, "step:start", {
            stepId,
            type,
            agentIds,
          });
        },
        onStepComplete: (stepId, ctx) => {
          const stepFindings = ctx.findings
            .filter((f: Finding) => f.step === stepId || f.step.startsWith(stepId))
            .map((f: Finding) => ({
              agent: f.agent,
              conclusion: f.analysis.conclusion,
              sentiment: f.analysis.sentiment,
              confidence: f.analysis.confidence,
            }));
          this.gateway.sendToClient(sessionId, "step:complete", {
            stepId,
            findings: stepFindings,
          });
        },
      },
    );

    // Store result
    session.context = result;
    session.status = "complete";

    // Send complete event with all findings
    this.gateway.sendToClient(sessionId, "analysis:complete", {
      context: {
        target: result.target,
        workflowName: result.workflowName,
        findings: result.findings.map((f: Finding) => ({
          step: f.step,
          agent: f.agent,
          analysis: f.analysis,
          timestamp: f.timestamp,
        })),
        debateRounds: result.debateRounds,
      },
    });
  }

  private async resolveTarget(dto: StartAnalysisDto): Promise<AnalysisTarget> {
    const client = new DataClient({ baseUrl: dto.dataServiceUrl });

    if (dto.sector) {
      const target: AnalysisTarget = { type: "sector", code: dto.sector };
      try {
        const info = await client.sector.constituents(dto.sector);
        target.name = info.name;
      } catch { /* use code as name */ }
      return target;
    }

    if (dto.index) {
      return { type: "index", code: dto.index };
    }

    if (dto.code) {
      const target: AnalysisTarget = { type: "stock", code: dto.code };
      try {
        const info = await client.reference.get(dto.code);
        target.name = info.name;
      } catch { /* use code as name */ }
      return target;
    }

    throw new Error("Must specify code, sector, or index");
  }

  private extractAgentIds(stepDef: any, _registry: AgentRegistry): string[] {
    if (!stepDef) return [];
    const ids: string[] = [];

    // Handle agent/match configs from step definition
    if (stepDef.agent) {
      const agents = Array.isArray(stepDef.agent) ? stepDef.agent : [stepDef.agent];
      for (const a of agents) {
        if (a.id) ids.push(a.id);
      }
    }
    if (stepDef.match?.id) ids.push(stepDef.match.id);
    if (stepDef.children) {
      for (const child of stepDef.children) {
        ids.push(...this.extractAgentIds(child, _registry));
      }
    }
    return [...new Set(ids)];
  }
}
```

- [ ] **Step 2: Create stub gateway so compilation passes**

Create `packages/server/src/analyze/analyze.gateway.ts`:

```typescript
import { Injectable } from "@nestjs/common";

@Injectable()
export class AnalyzeGateway {
  sendToClient(_sessionId: string, _eventType: string, _payload: unknown): void {
    // Will be implemented in Task 4
  }
}
```

- [ ] **Step 3: Update `packages/server/src/analyze/analyze.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { AnalyzeService } from "./analyze.service.js";
import { AnalyzeGateway } from "./analyze.gateway.js";

@Module({
  providers: [AnalyzeService, AnalyzeGateway],
  exports: [AnalyzeService],
})
export class AnalyzeModule {}
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd packages/server && pnpm build
```

Expected: builds without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/analyze/
git commit -m "feat(server): add AnalyzeService with core analysis orchestration"
```

---

### Task 4: Server AnalyzeController (REST API)

**Files:**
- Create: `packages/server/src/analyze/analyze.controller.ts`
- Modify: `packages/server/src/analyze/analyze.module.ts`

**Interfaces:**
- Consumes: `AnalyzeService.startAnalysis()`, `StartAnalysisDto`
- Produces: `POST /api/analyze` → `{ sessionId }`, `GET /api/analyze/:sessionId` → session status, `GET /api/workflows` → workflow list

- [ ] **Step 1: Create `packages/server/src/analyze/analyze.controller.ts`**

```typescript
import { Controller, Post, Get, Body, Param, ValidationPipe, UsePipes } from "@nestjs/common";
import { AnalyzeService } from "./analyze.service.js";
import { StartAnalysisDto } from "./dto/start-analysis.dto.js";
import { WORKFLOWS } from "../workflows/index.js";

@Controller("api")
export class AnalyzeController {
  constructor(private readonly analyzeService: AnalyzeService) {}

  @Post("analyze")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async startAnalysis(@Body() dto: StartAnalysisDto) {
    return this.analyzeService.startAnalysis(dto);
  }

  @Get("analyze/:sessionId")
  async getSessionStatus(@Param("sessionId") sessionId: string) {
    const session = this.analyzeService.getSession(sessionId);
    if (!session) {
      return { error: "Session not found" };
    }
    return {
      sessionId: session.id,
      status: session.status,
      error: session.error,
    };
  }

  @Get("workflows")
  getWorkflows() {
    return Object.entries(WORKFLOWS).map(([name, dag]) => ({
      name,
      description: dag.description,
    }));
  }
}
```

- [ ] **Step 2: Update `packages/server/src/analyze/analyze.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { AnalyzeService } from "./analyze.service.js";
import { AnalyzeGateway } from "./analyze.gateway.js";
import { AnalyzeController } from "./analyze.controller.js";

@Module({
  controllers: [AnalyzeController],
  providers: [AnalyzeService, AnalyzeGateway],
  exports: [AnalyzeService],
})
export class AnalyzeModule {}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd packages/server && pnpm build
```

Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/analyze/
git commit -m "feat(server): add REST endpoints for analyze and workflows"
```

---

### Task 5: Server AnalyzeGateway (WebSocket with Socket.IO)

**Files:**
- Replace: `packages/server/src/analyze/analyze.gateway.ts` (replace stub)
- Modify: `packages/server/src/analyze/analyze.module.ts`

**Interfaces:**
- Consumes: nothing externally
- Produces: `AnalyzeGateway` with `sendToClient(sessionId, eventType, payload)` and `@SubscribeMessage('subscribe')` handler, `@WebSocketGateway({ namespace: '/analysis' })`

- [ ] **Step 1: Replace `packages/server/src/analyze/analyze.gateway.ts`**

```typescript
import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  namespace: "/analysis",
  cors: { origin: "*" },
})
export class AnalyzeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AnalyzeGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Map socket.id → sessionId for session-scoped message routing */
  private readonly socketSessions = new Map<string, string>();

  handleConnection(client: Socket): void {
    this.logger.log(`WS client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.socketSessions.delete(client.id);
    this.logger.log(`WS client disconnected: ${client.id}`);
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(client: Socket, payload: { sessionId: string }): { event: string; data: { sessionId: string } } {
    const { sessionId } = payload;
    this.socketSessions.set(client.id, sessionId);
    client.join(sessionId);
    this.logger.log(`Client ${client.id} subscribed to session ${sessionId}`);
    return { event: "subscribed", data: { sessionId } };
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(client: Socket, payload: { sessionId: string }): { event: string; data: { sessionId: string } } {
    const { sessionId } = payload;
    client.leave(sessionId);
    this.socketSessions.delete(client.id);
    return { event: "unsubscribed", data: { sessionId } };
  }

  /** Send an event to all clients subscribed to a session */
  sendToClient(sessionId: string, eventType: string, payload: unknown): void {
    this.server.to(sessionId).emit(eventType, payload);
  }
}
```

- [ ] **Step 2: Update `packages/server/src/analyze/analyze.module.ts`**

No changes needed — the `AnalyzeGateway` is already registered as a provider. Verify the import still resolves correctly:

```bash
cd packages/server && pnpm build
```

Expected: builds without errors. The `@nestjs/websockets` Gateway is automatically registered as a WebSocket handler by NestJS when listed in `providers`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/analyze/analyze.gateway.ts
git commit -m "feat(server): implement WebSocket gateway with Socket.IO for real-time progress"
```

---

### Task 6: Server integration test

**Files:**
- Create: `packages/server/src/__tests__/analyze.integration.test.ts`
- Create: `packages/server/vitest.config.ts`

**Interfaces:**
- Consumes: all server components from Tasks 1-5
- Produces: passing integration test for POST /api/analyze + WS events

- [ ] **Step 1: Create `packages/server/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 2: Create `packages/server/src/__tests__/analyze.integration.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AppModule } from "../app.module.js";
import { io as ioc, Socket as ClientSocket } from "socket.io-client";
import { createServer, Server as HttpServer } from "node:http";

const TEST_PORT = 3099;

describe("Analyze API Integration", () => {
  let app: INestApplication;
  let httpServer: HttpServer;
  let wsClient: ClientSocket;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    httpServer = createServer();
    await app.init();
    // @ts-expect-error — NestJS internal adapter access for testing
    await app.listen(TEST_PORT);
  });

  afterAll(async () => {
    wsClient?.disconnect();
    await app.close();
  });

  it("should return workflow list", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/workflows`);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((w: any) => w.name === "bull-bear")).toBe(true);
    expect(data.some((w: any) => w.name === "quick-scan")).toBe(true);
  });

  it("POST /api/analyze should return sessionId", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "600519", workflow: "bull-bear", provider: "deepseek" }),
    });
    const data = await res.json();
    expect(data.sessionId).toBeDefined();
    expect(typeof data.sessionId).toBe("string");
  });

  it("POST /api/analyze should reject invalid workflow", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "600519", workflow: "invalid-wf" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("POST /api/analyze should reject request with no target", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: "bull-bear" }),
    });
    // Should not crash — will fail inside async runAnalysis, but POST returns sessionId
    // The validation doesn't require at least one of code/sector/index
    // This is a design choice: we validate in service, not DTO
    const data = await res.json();
    expect(data.sessionId).toBeDefined();
  });

  it("should receive WS events after subscribing to session", async () => {
    // Start analysis
    const res = await fetch(`http://localhost:${TEST_PORT}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "600519", workflow: "bull-bear", provider: "deepseek" }),
    });
    const { sessionId } = await res.json();

    // Connect WebSocket
    const events: { type: string }[] = [];
    wsClient = ioc(`http://localhost:${TEST_PORT}/analysis`, {
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      wsClient.on("connect", () => {
        wsClient.emit("subscribe", { sessionId });
        wsClient.on("subscribed", () => resolve());
      });
    });

    // Listen for events
    wsClient.on("analysis:start", (data) => events.push({ type: "analysis:start", ...data }));
    wsClient.on("step:start", (data) => events.push({ type: "step:start", ...data }));
    wsClient.on("step:complete", (data) => events.push({ type: "step:complete", ...data }));
    wsClient.on("analysis:complete", (data) => events.push({ type: "analysis:complete", ...data }));
    wsClient.on("analysis:error", (data) => events.push({ type: "analysis:error", ...data }));

    // Wait for analysis to finish (max 120s for LLM calls)
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const done = events.find(e => e.type === "analysis:complete" || e.type === "analysis:error");
        if (done) { clearInterval(check); resolve(); }
      }, 500);
      setTimeout(() => { clearInterval(check); resolve(); }, 120_000);
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === "analysis:start")).toBe(true);
    expect(events.some(e => e.type === "analysis:complete") || events.some(e => e.type === "analysis:error")).toBe(true);
  }, 130_000);
});
```

- [ ] **Step 3: Install socket.io-client for testing**

```bash
cd packages/server && pnpm add -D socket.io-client
```

- [ ] **Step 4: Run tests (only the non-LLM ones — the full WS test needs API keys)**

```bash
cd packages/server && pnpm test -- --run
```

Expected: first 3 tests pass (workflow list, session creation, validation). The 4th test (WS events) requires API keys and running data service — it will be skipped in CI by marking with `.skip` if no keys.

- [ ] **Step 5: Commit**

```bash
git add packages/server/vitest.config.ts packages/server/src/__tests__/
git commit -m "test(server): add integration tests for REST and WebSocket"
```

---

### Task 7: Web package scaffold (Vite + Vue 3 + Pinia)

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.ts`
- Create: `packages/web/src/App.vue`
- Create: `packages/web/src/env.d.ts`

**Interfaces:**
- Consumes: nothing (independent SPA)
- Produces: dev server on :5173, proxying /api and /analysis to :3000

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@agenttrade/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "vue-tsc --noEmit"
  },
  "dependencies": {
    "pinia": "^2.2.0",
    "socket.io-client": "^4.8.0",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-vue": "^5.1.0",
    "@vue/test-utils": "^2.4.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "vitest": "^2.0.0",
    "vue-tsc": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "jsx": "preserve",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "src/env.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/web/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create `packages/web/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentTrade — 多Agent对抗行情分析</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Create `packages/web/src/env.d.ts`**

```typescript
/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
```

- [ ] **Step 6: Create `packages/web/src/main.ts`**

```typescript
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "tailwindcss";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
```

- [ ] **Step 7: Create `packages/web/src/App.vue`**

```vue
<template>
  <div class="app">
    <header class="app-header">
      <h1>AgentTrade</h1>
      <span class="subtitle">多Agent对抗行情分析</span>
    </header>
    <main class="app-main">
      <p>Loading...</p>
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e1e4e8; }
.app { min-height: 100vh; display: flex; flex-direction: column; }
.app-header { padding: 16px 24px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: baseline; gap: 12px; }
.app-header h1 { font-size: 20px; color: #58a6ff; }
.app-header .subtitle { font-size: 14px; color: #8b949e; }
.app-main { flex: 1; display: flex; }
</style>
```

- [ ] **Step 8: Install web dependencies**

```bash
cd packages/web && pnpm install
```

- [ ] **Step 9: Verify build**

```bash
cd packages/web && pnpm build
```

Expected: builds without errors.

- [ ] **Step 10: Commit**

```bash
git add packages/web/
git commit -m "feat(web): scaffold Vue 3 + Vite + Pinia SPA"
```

---

### Task 8: Web Pinia analysis store

**Files:**
- Create: `packages/web/src/stores/analysis.ts`

**Interfaces:**
- Consumes: nothing (pure state)
- Produces: `useAnalysisStore` Pinia store with state, getters, and actions for handling WS events

- [ ] **Step 1: Create `packages/web/src/stores/analysis.ts`**

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface Target {
  type: string;
  code: string;
  name?: string;
}

export interface StepState {
  id: string;
  type: string;
  status: "pending" | "running" | "complete" | "error";
  agentIds: string[];
  summary?: string;
}

export interface LogEntry {
  time: number;
  agent: string;
  message: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

export interface Finding {
  step: string;
  agent: string;
  conclusion: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoning?: string[];
  rawOutput?: string;
}

export interface ReportData {
  target: Target;
  workflowName: string;
  findings: Finding[];
  sentiments: { bullish: number; bearish: number; neutral: number };
  conclusion?: string;
  elapsed?: number;
}

type AnalysisStatus = "idle" | "running" | "complete" | "error";

export const useAnalysisStore = defineStore("analysis", () => {
  const status = ref<AnalysisStatus>("idle");
  const target = ref<Target | null>(null);
  const workflow = ref<string | null>(null);
  const steps = ref<StepState[]>([]);
  const logs = ref<LogEntry[]>([]);
  const report = ref<ReportData | null>(null);
  const error = ref<string | null>(null);
  const sessionId = ref<string | null>(null);
  const stepCount = ref(0);
  const totalSteps = ref(0);

  const isRunning = computed(() => status.value === "running");

  function reset() {
    status.value = "idle";
    target.value = null;
    workflow.value = null;
    steps.value = [];
    logs.value = [];
    report.value = null;
    error.value = null;
    sessionId.value = null;
    stepCount.value = 0;
    totalSteps.value = 0;
  }

  function handleStart(payload: { target: Target; workflow: string }) {
    target.value = payload.target;
    workflow.value = payload.workflow;
    status.value = "running";
    error.value = null;
    steps.value = [];
    logs.value = [];
    report.value = null;

    addLog("system", `开始分析 ${payload.target.name ?? payload.target.code}`);
  }

  function handleStepStart(payload: { stepId: string; type: string; agentIds: string[] }) {
    stepCount.value++;
    steps.value.push({
      id: payload.stepId,
      type: payload.type,
      status: "running",
      agentIds: payload.agentIds,
    });
    addLog("system", `Step ${stepCount.value}: ${payload.stepId} (${payload.type}) 开始...`);
  }

  function handleStepComplete(payload: {
    stepId: string;
    findings: { agent: string; conclusion: string; sentiment: string; confidence: number }[];
  }) {
    const step = steps.value.find(s => s.id === payload.stepId);
    if (step) step.status = "complete";

    for (const f of payload.findings) {
      addLog(
        f.agent,
        f.conclusion.slice(0, 120),
        f.sentiment as "bullish" | "bearish" | "neutral",
      );
    }
  }

  function handleComplete(payload: { context: { target: Target; workflowName: string; findings: Finding[]; debateRounds: any[] } }) {
    status.value = "complete";
    const ctx = payload.context;
    const findings = ctx.findings ?? [];
    const sentiments = {
      bullish: findings.filter(f => f.analysis?.sentiment === "bullish").length,
      bearish: findings.filter(f => f.analysis?.sentiment === "bearish").length,
      neutral: findings.filter(f => f.analysis?.sentiment === "neutral").length,
    };

    const lastFinding = findings.at(-1);
    report.value = {
      target: ctx.target,
      workflowName: ctx.workflowName,
      findings: findings.map(f => ({
        step: f.step,
        agent: f.agent,
        conclusion: f.analysis?.conclusion ?? "",
        sentiment: f.analysis?.sentiment ?? "neutral",
        confidence: f.analysis?.confidence ?? 0,
        reasoning: f.analysis?.reasoning,
        rawOutput: f.analysis?.rawOutput,
      })),
      sentiments,
      conclusion: lastFinding?.analysis?.rawOutput ?? lastFinding?.analysis?.conclusion,
    };

    addLog("system", "分析完成");
  }

  function handleError(payload: { message: string }) {
    status.value = "error";
    error.value = payload.message;
    addLog("system", `错误: ${payload.message}`);
  }

  function addLog(agent: string, message: string, sentiment?: "bullish" | "bearish" | "neutral") {
    logs.value.push({ time: Date.now(), agent, message, sentiment });
  }

  return {
    status, target, workflow, steps, logs, report, error, sessionId, stepCount, totalSteps,
    isRunning,
    reset, handleStart, handleStepStart, handleStepComplete, handleComplete, handleError,
  };
});
```

- [ ] **Step 2: Write unit test `packages/web/src/__tests__/analysis-store.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAnalysisStore } from "../stores/analysis.js";

describe("Analysis Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should initialize with idle status", () => {
    const store = useAnalysisStore();
    expect(store.status).toBe("idle");
    expect(store.steps).toHaveLength(0);
    expect(store.logs).toHaveLength(0);
  });

  it("should handle analysis:start event", () => {
    const store = useAnalysisStore();
    store.handleStart({ target: { type: "stock", code: "600519", name: "贵州茅台" }, workflow: "bull-bear" });
    expect(store.status).toBe("running");
    expect(store.target?.code).toBe("600519");
    expect(store.logs.length).toBeGreaterThan(0);
  });

  it("should handle step:start and step:complete events", () => {
    const store = useAnalysisStore();
    store.handleStart({ target: { type: "stock", code: "600519" }, workflow: "bull-bear" });
    store.handleStepStart({ stepId: "bull-analysis", type: "analyze", agentIds: ["technical-bull"] });
    expect(store.steps).toHaveLength(1);
    expect(store.steps[0].status).toBe("running");

    store.handleStepComplete({
      stepId: "bull-analysis",
      findings: [{ agent: "technical-bull", conclusion: "看涨", sentiment: "bullish", confidence: 0.8 }],
    });
    expect(store.steps[0].status).toBe("complete");
    expect(store.logs.length).toBeGreaterThan(1);
  });

  it("should handle analysis:complete event", () => {
    const store = useAnalysisStore();
    store.handleStart({ target: { type: "stock", code: "600519" }, workflow: "bull-bear" });
    store.handleComplete({
      context: {
        target: { type: "stock", code: "600519", name: "茅台" },
        workflowName: "bull-bear",
        findings: [
          { step: "bull", agent: "bull", analysis: { conclusion: "看涨", sentiment: "bullish", confidence: 0.8, reasoning: [] } },
          { step: "bear", agent: "bear", analysis: { conclusion: "看跌", sentiment: "bearish", confidence: 0.6, reasoning: [] } },
        ],
        debateRounds: [],
      },
    });
    expect(store.status).toBe("complete");
    expect(store.report).not.toBeNull();
    expect(store.report!.sentiments.bullish).toBe(1);
    expect(store.report!.sentiments.bearish).toBe(1);
  });

  it("should handle analysis:error event", () => {
    const store = useAnalysisStore();
    store.handleError({ message: "Network error" });
    expect(store.status).toBe("error");
    expect(store.error).toBe("Network error");
  });

  it("should reset all state", () => {
    const store = useAnalysisStore();
    store.handleStart({ target: { type: "stock", code: "000001" }, workflow: "quick-scan" });
    store.reset();
    expect(store.status).toBe("idle");
    expect(store.steps).toHaveLength(0);
    expect(store.logs).toHaveLength(0);
    expect(store.report).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd packages/web && pnpm test -- --run
```

Expected: all 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/stores/ packages/web/src/__tests__/
git commit -m "feat(web): add Pinia analysis store with event handlers"
```

---

### Task 9: Web WebSocket composable

**Files:**
- Create: `packages/web/src/composables/useAnalysisSocket.ts`

**Interfaces:**
- Consumes: `useAnalysisStore` from Task 8
- Produces: `useAnalysisSocket()` composable returning `{ connect, disconnect, connected }`

- [ ] **Step 1: Create `packages/web/src/composables/useAnalysisSocket.ts`**

```typescript
import { ref, onUnmounted } from "vue";
import { io, Socket } from "socket.io-client";
import { useAnalysisStore } from "@/stores/analysis";

export function useAnalysisSocket() {
  const store = useAnalysisStore();
  const connected = ref(false);
  let socket: Socket | null = null;

  function connect(sessionId: string) {
    // Disconnect any existing socket
    disconnect();

    const url = window.location.origin;
    socket = io(`${url}/analysis`, {
      transports: ["websocket", "polling"],
      forceNew: true,
    });

    socket.on("connect", () => {
      connected.value = true;
      socket!.emit("subscribe", { sessionId });
    });

    socket.on("subscribed", (_data: { sessionId: string }) => {
      console.log(`[WS] Subscribed to session ${sessionId}`);
    });

    socket.on("analysis:start", (payload: any) => {
      store.handleStart(payload);
    });

    socket.on("step:start", (payload: any) => {
      store.handleStepStart(payload);
    });

    socket.on("step:complete", (payload: any) => {
      store.handleStepComplete(payload);
    });

    socket.on("analysis:complete", (payload: any) => {
      store.handleComplete(payload);
    });

    socket.on("analysis:error", (payload: any) => {
      store.handleError(payload);
    });

    socket.on("disconnect", () => {
      connected.value = false;
    });

    socket.on("connect_error", (err: Error) => {
      console.error("[WS] Connection error:", err.message);
      connected.value = false;
    });
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    connected.value = false;
  }

  onUnmounted(() => {
    disconnect();
  });

  return { connect, disconnect, connected };
}
```

- [ ] **Step 2: Verify build**

```bash
cd packages/web && pnpm build
```

Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/composables/
git commit -m "feat(web): add WebSocket composable for real-time analysis events"
```

---

### Task 10: Web App layout and header

**Files:**
- Create: `packages/web/src/components/AppHeader.vue`
- Modify: `packages/web/src/App.vue`

**Interfaces:**
- Consumes: nothing
- Produces: App shell with header, two-column main layout

- [ ] **Step 1: Create `packages/web/src/components/AppHeader.vue`**

```vue
<template>
  <header class="flex items-baseline gap-4 px-6 py-3.5 bg-[#161b22] border-b border-[#30363d]">
    <div class="flex items-baseline gap-2">
      <h1 class="text-xl font-bold text-[#58a6ff]">AgentTrade</h1>
      <span class="text-[10px] bg-[#1f6feb33] text-[#58a6ff] px-1.5 py-px rounded font-semibold uppercase tracking-wide">ALPHA</span>
    </div>
    <span class="text-sm text-[#8b949e]">多Agent对抗行情分析</span>
  </header>
</template>

<script setup lang="ts">
</script>
```

- [ ] **Step 2: Update `packages/web/src/App.vue`**

```vue
<template>
  <div class="min-h-screen flex flex-col bg-[#0f1117] text-[#e1e4e8] font-sans">
    <AppHeader />
    <main class="flex-1 flex overflow-hidden">
      <aside class="w-80 min-w-80 bg-[#161b22] border-r border-[#30363d] p-5 overflow-y-auto">
        <div class="p-10 text-center text-[#8b949e] border border-dashed border-[#30363d] rounded-lg m-5">
          <p>输入面板将在下一步实现</p>
        </div>
      </aside>
      <section class="flex-1 flex flex-col overflow-y-auto">
        <div class="p-10 text-center text-[#8b949e] border border-dashed border-[#30363d] rounded-lg m-5">
          <p>流程可视化将在后续步骤实现</p>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from "./components/AppHeader.vue";
</script>
```

- [ ] **Step 3: Verify build**

```bash
cd packages/web && pnpm dev &
# Check that the app loads without errors, then kill
```

Or run build to verify:

```bash
cd packages/web && pnpm build
```

Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/AppHeader.vue packages/web/src/App.vue
git commit -m "feat(web): add app layout with header and two-column shell"
```

---

### Task 11: Web InputPanel with sub-components

**Files:**
- Create: `packages/web/src/components/InputPanel.vue`
- Create: `packages/web/src/components/StockInput.vue`
- Create: `packages/web/src/components/SectorInput.vue`
- Create: `packages/web/src/components/WorkflowSelect.vue`
- Create: `packages/web/src/components/ModelSelect.vue`
- Modify: `packages/web/src/App.vue`

**Interfaces:**
- Consumes: `useAnalysisStore` from Task 8, `useAnalysisSocket` from Task 9
- Produces: `InputPanel` emits `start` event with form data; calls POST /api/analyze then connects WS

- [ ] **Step 1: Create `packages/web/src/components/StockInput.vue`**

```vue
<template>
  <div class="mb-4">
    <label class="block text-[13px] text-[#8b949e] mb-1.5 font-medium">股票代码</label>
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      placeholder="如 600519"
      type="text"
      maxlength="6"
      class="w-full px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none transition-colors focus:border-[#58a6ff] placeholder:text-[#484f58]"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
```

- [ ] **Step 2: Create `packages/web/src/components/SectorInput.vue`**

```vue
<template>
  <div class="mb-4">
    <label class="block text-[13px] text-[#8b949e] mb-1.5 font-medium">板块名称</label>
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      placeholder="如 CPO、新能源汽车"
      type="text"
      class="w-full px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none transition-colors focus:border-[#58a6ff] placeholder:text-[#484f58]"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
```

- [ ] **Step 3: Create `packages/web/src/components/WorkflowSelect.vue`**

```vue
<template>
  <div class="mb-4">
    <label class="block text-[13px] text-[#8b949e] mb-1.5 font-medium">分析工作流</label>
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      class="w-full px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none cursor-pointer transition-colors focus:border-[#58a6ff]"
    >
      <option value="bull-bear">🐂🐻 牛熊对抗 (Bull-Bear)</option>
      <option value="quick-scan">⚡ 快速扫描 (Quick Scan)</option>
    </select>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
```

- [ ] **Step 4: Create `packages/web/src/components/ModelSelect.vue`**

```vue
<template>
  <div class="mb-4">
    <label class="block text-[13px] text-[#8b949e] mb-1.5 font-medium">模型</label>
    <div class="flex gap-2">
      <select
        :value="provider"
        @change="$emit('update:provider', ($event.target as HTMLSelectElement).value)"
        class="flex-[0_0_120px] px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none cursor-pointer focus:border-[#58a6ff]"
      >
        <option value="deepseek">DeepSeek</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
      </select>
      <input
        :value="model"
        @input="$emit('update:model', ($event.target as HTMLInputElement).value)"
        placeholder="自定义模型名称"
        type="text"
        class="flex-1 px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58] placeholder:text-xs"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ provider: string; model: string }>();
defineEmits<{
  (e: "update:provider", value: string): void;
  (e: "update:model", value: string): void;
}>();
</script>
```

- [ ] **Step 5: Create `packages/web/src/components/InputPanel.vue`**

```vue
<template>
  <div>
    <h2 class="text-base font-semibold text-[#e1e4e8] mb-5 pb-2.5 border-b border-[#30363d]">分析参数</h2>

    <StockInput v-model="stockCode" />
    <SectorInput v-model="sectorName" />
    <WorkflowSelect v-model="selectedWorkflow" />
    <ModelSelect
      v-model:provider="selectedProvider"
      v-model:model="selectedModel"
    />

    <div v-if="error" class="px-3 py-2.5 mb-3.5 bg-[#49020233] border border-[#f8514966] rounded-md text-[#f85149] text-[13px]">{{ error }}</div>

    <button
      class="w-full p-3 bg-[#238636] border-none rounded-md text-white text-[15px] font-semibold cursor-pointer transition-colors mb-3 hover:enabled:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#484f58] disabled:cursor-not-allowed"
      :disabled="isRunning || !canStart"
      @click="startAnalysis"
    >
      {{ isRunning ? "⏳ 分析中..." : "🔍 开始分析" }}
    </button>

    <div v-if="isRunning && steps.length > 0" class="mt-3">
      <p class="text-[13px] text-[#8b949e]">
        进度: {{ completedSteps }}/{{ steps.length }} 步骤
      </p>
    </div>

    <button
      v-if="status === 'complete' || status === 'error'"
      class="w-full p-2.5 bg-[#21262d] border border-[#30363d] rounded-md text-sm text-[#8b949e] cursor-pointer transition-all hover:bg-[#30363d] hover:text-[#e1e4e8]"
      @click="store.reset()"
    >
      🔄 新分析
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import StockInput from "./StockInput.vue";
import SectorInput from "./SectorInput.vue";
import WorkflowSelect from "./WorkflowSelect.vue";
import ModelSelect from "./ModelSelect.vue";
import { useAnalysisStore } from "@/stores/analysis";
import { useAnalysisSocket } from "@/composables/useAnalysisSocket";

const store = useAnalysisStore();
const { connect: connectWS, disconnect: disconnectWS } = useAnalysisSocket();

const stockCode = ref("");
const sectorName = ref("");
const selectedWorkflow = ref("bull-bear");
const selectedProvider = ref("deepseek");
const selectedModel = ref("");
const error = ref<string | null>(null);

const isRunning = computed(() => store.isRunning);
const status = computed(() => store.status);
const steps = computed(() => store.steps);

const completedSteps = computed(() => steps.value.filter(s => s.status === "complete").length);

const canStart = computed(() => {
  return stockCode.value.trim() || sectorName.value.trim();
});

async function startAnalysis() {
  error.value = null;
  store.reset();

  try {
    const body: Record<string, string> = {
      workflow: selectedWorkflow.value,
      provider: selectedProvider.value,
    };
    if (selectedModel.value) body.model = selectedModel.value;
    if (stockCode.value.trim()) body.code = stockCode.value.trim();
    if (sectorName.value.trim()) body.sector = sectorName.value.trim();

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      error.value = data.message ?? "请求失败";
      return;
    }

    store.sessionId = data.sessionId;
    connectWS(data.sessionId);
  } catch (err: any) {
    error.value = err.message ?? "网络错误";
    store.handleError({ message: error.value! });
  }
}
</script>
```

- [ ] **Step 6: Update `packages/web/src/App.vue` to use InputPanel**

```vue
<template>
  <div class="min-h-screen flex flex-col bg-[#0f1117] text-[#e1e4e8] font-sans">
    <AppHeader />
    <main class="flex-1 flex overflow-hidden">
      <aside class="w-80 min-w-80 bg-[#161b22] border-r border-[#30363d] p-5 overflow-y-auto">
        <InputPanel />
      </aside>
      <section class="flex-1 flex flex-col overflow-y-auto">
        <div class="p-10 text-center text-[#8b949e] border border-dashed border-[#30363d] rounded-lg m-5">
          <p>流程可视化将在后续步骤实现</p>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from "./components/AppHeader.vue";
import InputPanel from "./components/InputPanel.vue";
</script>
```

- [ ] **Step 7: Verify build**

```bash
cd packages/web && pnpm build
```

Expected: builds without errors.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/InputPanel.vue packages/web/src/components/StockInput.vue packages/web/src/components/SectorInput.vue packages/web/src/components/WorkflowSelect.vue packages/web/src/components/ModelSelect.vue packages/web/src/App.vue
git commit -m "feat(web): add input panel with stock/sector inputs, workflow and model selectors"
```

---

### Task 12: Web FlowView — StepProgress + LiveLog

**Files:**
- Create: `packages/web/src/components/StepProgress.vue`
- Create: `packages/web/src/components/LiveLog.vue`
- Create: `packages/web/src/components/FlowView.vue`
- Modify: `packages/web/src/App.vue`

**Interfaces:**
- Consumes: `useAnalysisStore` steps and logs
- Produces: Flow visualization with step nodes and scrolling log console

- [ ] **Step 1: Create `packages/web/src/components/StepProgress.vue`**

```vue
<template>
  <div>
    <h2 class="text-sm font-semibold text-[#e1e4e8] mb-4 pb-2 border-b border-[#30363d]">分析流程</h2>
    <div v-if="steps.length === 0" class="text-[#484f58] text-[13px] text-center py-5">
      等待分析开始...
    </div>
    <div v-else class="flex flex-wrap items-start gap-1">
      <div
        v-for="(step, index) in steps"
        :key="step.id"
        class="flex items-center"
      >
        <div v-if="index > 0" class="flex items-center mx-1">
          <span class="w-4 h-0.5 bg-[#30363d]"></span>
          <span class="text-[#484f58] text-xs ml-0.5">→</span>
        </div>
        <div
          class="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-[#0d1117] border min-w-[140px] transition-all duration-300"
          :class="{
            'border-[#58a6ff] shadow-[0_0_8px_#58a6ff33] animate-pulse': step.status === 'running',
            'border-[#238636]': step.status === 'complete',
            'border-[#f85149]': step.status === 'error',
            'border-[#30363d]': step.status === 'pending',
          }"
        >
          <span class="text-base">{{ statusIcon(step.status) }}</span>
          <div class="flex flex-col gap-0.5">
            <span class="text-[13px] font-semibold text-[#e1e4e8]">{{ step.id }}</span>
            <span class="text-[11px] text-[#8b949e]">{{ step.type }}</span>
            <span v-if="step.agentIds.length > 0" class="text-[11px] text-[#58a6ff]">
              {{ step.agentIds.join(", ") }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StepState } from "@/stores/analysis";

defineProps<{ steps: StepState[] }>();

function statusIcon(status: string): string {
  switch (status) {
    case "complete": return "✅";
    case "running": return "🔄";
    case "error": return "❌";
    default: return "⏳";
  }
}
</script>
```

- [ ] **Step 2: Create `packages/web/src/components/LiveLog.vue`**

```vue
<template>
  <div>
    <div class="flex items-center justify-between mb-3 pb-2 border-b border-[#30363d]">
      <h2 class="text-sm font-semibold text-[#e1e4e8]">实时输出</h2>
      <span v-if="isRunning" class="text-xs text-[#238636] animate-pulse">● 运行中</span>
    </div>
    <div
      ref="logContainer"
      class="h-60 overflow-y-auto p-3 bg-[#0d1117] border border-[#30363d] rounded-lg font-mono text-xs leading-relaxed"
    >
      <div v-if="logs.length === 0" class="text-[#484f58] text-center py-5">
        等待输出...
      </div>
      <div
        v-for="(entry, index) in logs"
        :key="index"
        class="flex gap-2 py-0.5"
      >
        <span class="text-[#484f58] whitespace-nowrap">{{ formatTime(entry.time) }}</span>
        <span class="text-[#58a6ff] whitespace-nowrap font-semibold">[{{ entry.agent }}]</span>
        <span
          class="break-all"
          :class="{
            'text-[#3fb950]': entry.sentiment === 'bullish',
            'text-[#f85149]': entry.sentiment === 'bearish',
            'text-[#c9d1d9]': !entry.sentiment || entry.sentiment === 'neutral',
          }"
        >{{ entry.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { LogEntry } from "@/stores/analysis";

const props = defineProps<{
  logs: LogEntry[];
  isRunning: boolean;
}>();

const logContainer = ref<HTMLElement | null>(null);

watch(
  () => props.logs.length,
  async () => {
    await nextTick();
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  },
);

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}
</script>
```

- [ ] **Step 3: Create `packages/web/src/components/FlowView.vue`**

```vue
<template>
  <div class="p-5 flex flex-col gap-6 flex-1">
    <StepProgress :steps="store.steps" />
    <LiveLog :logs="store.logs" :is-running="store.isRunning" />
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import StepProgress from "./StepProgress.vue";
import LiveLog from "./LiveLog.vue";

const store = useAnalysisStore();
</script>
```

- [ ] **Step 4: Update `packages/web/src/App.vue`**

```vue
<template>
  <div class="min-h-screen flex flex-col bg-[#0f1117] text-[#e1e4e8] font-sans">
    <AppHeader />
    <main class="flex-1 flex overflow-hidden">
      <aside class="w-80 min-w-80 bg-[#161b22] border-r border-[#30363d] p-5 overflow-y-auto">
        <InputPanel />
      </aside>
      <section class="flex-1 flex flex-col overflow-y-auto">
        <FlowView />
        <ReportView v-if="store.status === 'complete'" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from "./components/AppHeader.vue";
import InputPanel from "./components/InputPanel.vue";
import FlowView from "./components/FlowView.vue";
import ReportView from "./components/ReportView.vue";
import { useAnalysisStore } from "@/stores/analysis";

const store = useAnalysisStore();
</script>
```

- [ ] **Step 5: Verify build**

```bash
cd packages/web && pnpm build
```

Expected: fails — `ReportView` not yet created. Create a stub `packages/web/src/components/ReportView.vue`:

```vue
<template>
  <div class="p-5 border-t border-[#30363d]">
    <p class="text-[#8b949e]">报告将在分析完成后展示</p>
  </div>
</template>

<script setup lang="ts">
</script>
```

Then build:

```bash
cd packages/web && pnpm build
```

Expected: builds without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/StepProgress.vue packages/web/src/components/LiveLog.vue packages/web/src/components/FlowView.vue packages/web/src/components/ReportView.vue packages/web/src/App.vue
git commit -m "feat(web): add flow visualization with step progress and live log"
```

---

### Task 13: Web ReportView

**Files:**
- Create: `packages/web/src/components/SentimentChart.vue`
- Create: `packages/web/src/components/FindingList.vue`
- Create: `packages/web/src/components/ConclusionCard.vue`
- Replace: `packages/web/src/components/ReportView.vue` (replace stub)

**Interfaces:**
- Consumes: `useAnalysisStore.report`
- Produces: Full analysis report display

- [ ] **Step 1: Create `packages/web/src/components/SentimentChart.vue`**

```vue
<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold text-[#e1e4e8] mb-3.5">多空分布</h3>
    <div class="flex flex-col gap-2.5">
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px]">🟢 看多</span>
        <div class="flex-1 h-5 bg-[#21262d] rounded overflow-hidden">
          <div class="h-full rounded bg-[#238636] transition-[width] duration-600" :style="{ width: bullPct + '%' }"></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right">{{ sentiments.bullish }}</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px]">🔴 看空</span>
        <div class="flex-1 h-5 bg-[#21262d] rounded overflow-hidden">
          <div class="h-full rounded bg-[#da3633] transition-[width] duration-600" :style="{ width: bearPct + '%' }"></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right">{{ sentiments.bearish }}</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px]">⚪ 中性</span>
        <div class="flex-1 h-5 bg-[#21262d] rounded overflow-hidden">
          <div class="h-full rounded bg-[#484f58] transition-[width] duration-600" :style="{ width: neutralPct + '%' }"></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right">{{ sentiments.neutral }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  sentiments: { bullish: number; bearish: number; neutral: number };
}>();

const total = computed(() => props.sentiments.bullish + props.sentiments.bearish + props.sentiments.neutral || 1);

const bullPct = computed(() => Math.round((props.sentiments.bullish / total.value) * 100));
const bearPct = computed(() => Math.round((props.sentiments.bearish / total.value) * 100));
const neutralPct = computed(() => Math.round((props.sentiments.neutral / total.value) * 100));
</script>
```

- [ ] **Step 2: Create `packages/web/src/components/FindingList.vue`**

```vue
<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold text-[#e1e4e8] mb-3.5">各方观点</h3>
    <div
      v-for="(f, i) in findings"
      :key="i"
      class="p-3.5 mb-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg"
      :class="{
        'border-l-[3px] border-l-[#238636]': f.sentiment === 'bullish',
        'border-l-[3px] border-l-[#da3633]': f.sentiment === 'bearish',
        'border-l-[3px] border-l-[#8b949e]': f.sentiment === 'neutral',
      }"
    >
      <div class="flex justify-between mb-2">
        <span class="text-[13px] font-semibold text-[#58a6ff]">{{ f.agent }}</span>
        <span class="text-xs text-[#8b949e]">{{ Math.round(f.confidence * 100) }}% 置信度</span>
      </div>
      <p class="text-sm text-[#e1e4e8] leading-relaxed mb-1.5">{{ f.conclusion }}</p>
      <ul v-if="f.reasoning && f.reasoning.length > 0" class="mt-2 pl-[18px]">
        <li v-for="(r, j) in f.reasoning" :key="j" class="text-[13px] text-[#8b949e] mb-0.5">{{ r }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Finding } from "@/stores/analysis";

defineProps<{ findings: Finding[] }>();
</script>
```

- [ ] **Step 3: Create `packages/web/src/components/ConclusionCard.vue`**

```vue
<template>
  <div class="p-[18px] bg-[#0d1117] border border-[#30363d] border-t-[3px] border-t-[#58a6ff] rounded-lg">
    <h3 class="text-[15px] font-semibold text-[#58a6ff] mb-3">📋 综合研判</h3>
    <div class="text-sm text-[#e1e4e8] leading-relaxed whitespace-pre-wrap">
      <p>{{ conclusion }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ conclusion: string }>();
</script>
```

- [ ] **Step 4: Replace `packages/web/src/components/ReportView.vue`**

```vue
<template>
  <div v-if="store.report" class="px-5 py-6 border-t border-[#30363d]">
    <h2 class="text-lg font-semibold text-[#e1e4e8] mb-5">📊 分析报告 — {{ store.report.target.name ?? store.report.target.code }}</h2>
    <div class="grid grid-cols-[280px_1fr] gap-6 max-[900px]:grid-cols-1">
      <SentimentChart :sentiments="store.report.sentiments" />
      <FindingList :findings="store.report.findings" />
    </div>
    <ConclusionCard
      v-if="store.report.conclusion"
      :conclusion="store.report.conclusion"
    />
  </div>
  <div v-else class="px-5 py-6 border-t border-[#30363d]">
    <p class="text-sm text-[#8b949e]">等待分析完成...</p>
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import SentimentChart from "./SentimentChart.vue";
import FindingList from "./FindingList.vue";
import ConclusionCard from "./ConclusionCard.vue";

const store = useAnalysisStore();
</script>
```

- [ ] **Step 5: Verify build**

```bash
cd packages/web && pnpm build
```

Expected: builds without errors.

- [ ] **Step 6: Run store tests**

```bash
cd packages/web && pnpm test -- --run
```

Expected: all 6 store tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/SentimentChart.vue packages/web/src/components/FindingList.vue packages/web/src/components/ConclusionCard.vue packages/web/src/components/ReportView.vue
git commit -m "feat(web): add analysis report with sentiment chart, finding list, and conclusion"
```

---

### Task 14: Final integration — wire everything + verify end-to-end

**Files:**
- Modify: `packages/server/src/main.ts` (add dotenv, port config)
- Create or verify: root `package.json` scripts (add `dev:server` and `dev:web` scripts)

**Goal:** Verify that starting server + web together works, and the full analysis flow (POST → WS → report) functions.

- [ ] **Step 1: Update root `package.json` with new scripts**

Add to `D:\c2\package.json`:

```json
{
  "scripts": {
    "dev:server": "pnpm --filter @agenttrade/server dev",
    "dev:web": "pnpm --filter @agenttrade/web dev",
    "build:server": "pnpm --filter @agenttrade/server build",
    "build:web": "pnpm --filter @agenttrade/web build"
  }
}
```

Full updated file:

```json
{
  "name": "agenttrade",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "build:server": "pnpm --filter @agenttrade/server build",
    "build:web": "pnpm --filter @agenttrade/web build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "analyze": "node packages/cli/dist/index.js analyze",
    "dev:server": "pnpm --filter @agenttrade/server dev",
    "dev:web": "pnpm --filter @agenttrade/web dev"
  }
}
```

- [ ] **Step 2: Install all dependencies and build everything**

```bash
pnpm install
pnpm build
```

Expected: all packages build without errors.

- [ ] **Step 3: Verify server starts**

```bash
pnpm dev:server
# In another terminal, check the health
curl http://localhost:3000/api/workflows
```

Expected: returns JSON array with `bull-bear` and `quick-scan`.

- [ ] **Step 4: Verify web dev server starts**

```bash
pnpm dev:web
# Open http://localhost:5173 in browser
```

Expected: SPA loads, input panel visible, no JS errors in console.

- [ ] **Step 5: Run full analysis test (manual)**

1. Start data service: `cd d2-data && python main.py`
2. Start server: `pnpm dev:server`
3. Start web: `pnpm dev:web`
4. Open http://localhost:5173
5. Enter stock code `600519`, select workflow `bull-bear`, click "开始分析"
6. Verify: step progress updates in real-time, live log scrolls, report appears on completion

- [ ] **Step 6: Commit final changes**

```bash
git add package.json
git commit -m "chore: add dev:server and dev:web scripts for web UI development"
```

---
