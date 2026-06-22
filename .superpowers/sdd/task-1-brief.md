### Task 1: ChatMessage Types

**Files:**
- Create: `lib/chat/types.ts`
- Test: `lib/chat/__tests__/types.test.ts`

**Interfaces:**
- Produces: `ChatMessage`, `SessionStatus`, `ChatSession`, `DirectorEvent`, `SSEEvent` types — consumed by all subsequent tasks

- [ ] **Step 1: Write the type definitions**

```ts
// lib/chat/types.ts
import type { Analysis, AnalysisTarget, Finding } from "../engine/types.js";

export type SessionStatus = "RUNNING" | "PAUSED" | "STOPPED";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "agent" | "user" | "system";
  senderId: string;
  senderName: string;
  content: string;
  metadata: {
    type: "analysis" | "critique" | "synthesis" | "interjection" | "step-boundary";
    stepId?: string;
    layer?: string;
    analysis?: Analysis;
    mentionAgentIds?: string[];
    isWorkflowStep?: boolean;
  } | null;
  timestamp: number;
}

export type PendingMessage = Omit<ChatMessage, "id" | "sessionId" | "timestamp">;

export interface ChatSession {
  id: string;
  target: AnalysisTarget;
  workflowName: string;
  status: SessionStatus;
  stepIndex: number;
  findings: Finding[];
  createdAt: number;
}

export interface DirectorEvent {
  type: "step-start" | "step-complete" | "layer-boundary";
  stepId?: string;
  stepType?: string;
  layer?: string;
  agentIds?: string[];
}

export interface SSEEvent {
  event: string;
  data: unknown;
}

export interface CreateSessionInput {
  code?: string;
  sector?: string;
  index?: string;
  workflow?: string;
  provider?: string;
  model?: string;
  dataServiceUrl?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/chat/types.ts && git commit -m "feat(chat): add ChatMessage and session types"
```

---

