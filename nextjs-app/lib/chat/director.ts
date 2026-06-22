import type { WorkflowDAG, WorkflowStep, Finding, AnalysisTarget } from "../engine/types.js";
import type { PendingMessage, SessionStatus } from "./types.js";
import type { AnalyzeOptions } from "../llm/create-llm.js";
import { createLLM } from "../llm/create-llm.js";
import { parseLLMJson, parseSentiment } from "../llm/parse.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export class Director {
  status: SessionStatus = "RUNNING";
  private stepIndex = 0;
  private dag: WorkflowDAG;
  private options: AnalyzeOptions;

  constructor(dag: WorkflowDAG, options: AnalyzeOptions = {}) {
    this.dag = dag;
    this.options = options;
  }

  pause(): void {
    if (this.status === "RUNNING") this.status = "PAUSED";
  }

  resume(): void {
    if (this.status === "PAUSED") this.status = "RUNNING";
  }

  stop(): void {
    this.status = "STOPPED";
  }

  async advance(
    target: AnalysisTarget,
    findings: Finding[],
    history: { senderId: string; senderName: string; content: string }[],
    onMessage: (msg: PendingMessage) => Promise<void>,
  ): Promise<{ hasMore: boolean }> {
    if (this.status === "PAUSED" || this.status === "STOPPED") {
      return { hasMore: this.status !== "STOPPED" };
    }

    if (this.stepIndex >= this.dag.steps.length) {
      this.status = "STOPPED";
      await onMessage({
        role: "system",
        senderId: "director",
        senderName: "导演",
        content: "分析流程已完成",
        metadata: { type: "step-boundary" },
      });
      return { hasMore: false };
    }

    const step = this.dag.steps[this.stepIndex];
    const layer = this.inferLayer(step);

    // Emit layer boundary if entering a new layer
    if (layer && (this.stepIndex === 0 || this.inferLayer(this.dag.steps[this.stepIndex - 1]) !== layer)) {
      const layerNames: Record<string, string> = {
        perception: "数据感知层",
        analysis: "分析层",
        decision: "决策层",
        execution: "执行与风控层",
      };
      await onMessage({
        role: "system",
        senderId: "director",
        senderName: "导演",
        content: `进入「${layerNames[layer] ?? layer}」`,
        metadata: { type: "step-boundary", layer },
      });
    }

    // Execute step
    await this.executeStep(step, target, findings, history, onMessage);
    this.stepIndex++;

    const hasMore = this.stepIndex < this.dag.steps.length;
    return { hasMore };
  }

  private async executeStep(
    step: WorkflowStep,
    target: AnalysisTarget,
    findings: Finding[],
    history: { senderId: string; senderName: string; content: string }[],
    onMessage: (msg: PendingMessage) => Promise<void>,
  ): Promise<void> {
    switch (step.type) {
      case "analyze":
        return this.execAnalyze(step, target, findings, history, onMessage);
      case "panel":
      case "vote":
        return this.execPanel(step, target, findings, history, onMessage);
      case "synthesize":
        return this.execSynthesize(step, target, findings, onMessage);
      case "critique":
        return this.execCritique(step, target, findings, onMessage);
      case "debate":
        return this.execDebate(step, target, findings, onMessage);
      case "parallel": {
        if (!step.children) return;
        await Promise.all(
          step.children.map((child) =>
            this.executeStep(child, target, findings, history, onMessage),
          ),
        );
        return;
      }
      case "sequential": {
        if (!step.children) return;
        for (const child of step.children) {
          await this.executeStep(child, target, findings, history, onMessage);
        }
        return;
      }
      default:
        return;
    }
  }

  private async execAnalyze(
    step: WorkflowStep,
    target: AnalysisTarget,
    findings: Finding[],
    history: { senderId: string; senderName: string; content: string }[],
    onMessage: (msg: PendingMessage) => Promise<void>,
  ): Promise<void> {
    const agentMatch = Array.isArray(step.agent) ? step.agent[0] : step.agent;
    const agentId = agentMatch?.id;
    if (!agentId) throw new Error(`Analyze step "${step.id}" requires agent.id`);
    const prompt = (step.prompt ?? "分析 {target}").replace("{target}", target.name ?? target.code);
    await this.invokeAgent(agentId, prompt, target, findings, history, onMessage, step);
  }

  private async execPanel(
    step: WorkflowStep,
    target: AnalysisTarget,
    findings: Finding[],
    history: { senderId: string; senderName: string; content: string }[],
    onMessage: (msg: PendingMessage) => Promise<void>,
  ): Promise<void> {
    const agentMatches = (Array.isArray(step.agent) ? step.agent : [step.agent]).filter((x): x is NonNullable<typeof x> => x != null);
    const prompt = (step.prompt ?? "分析 {target}").replace("{target}", target.name ?? target.code);
    await Promise.all(
      agentMatches.map((m) =>
        this.invokeAgent(m.id!, prompt, target, findings, history, onMessage, step),
      ),
    );
  }

  private async execSynthesize(
    step: WorkflowStep,
    target: AnalysisTarget,
    findings: Finding[],
    onMessage: (msg: PendingMessage) => Promise<void>,
  ): Promise<void> {
    const agentMatch = Array.isArray(step.agent) ? step.agent[0] : step.agent;
    const agentId = agentMatch?.id;
    if (!agentId) throw new Error("Synthesize requires agent.id");
    const allFindingsText = findings
      .map(
        (f) =>
          `[${f.agent}](${f.analysis.sentiment}, conf=${f.analysis.confidence}): ${f.analysis.conclusion}`,
      )
      .join("\n");
    const prompt = `${step.prompt ?? "综合所有分析"}\n\n已有分析：\n${allFindingsText}`;
    await this.invokeAgent(agentId, prompt, target, findings, [], onMessage, step);
  }

  private async execCritique(
    step: WorkflowStep,
    target: AnalysisTarget,
    findings: Finding[],
    onMessage: (msg: PendingMessage) => Promise<void>,
  ): Promise<void> {
    const agentMatch = Array.isArray(step.agent) ? step.agent[0] : step.agent;
    const agentId = agentMatch?.id;
    if (!agentId) throw new Error("Critique requires agent.id");
    const targetFindings = findings.filter((f) => f.step === step.targetStep);
    const targetText = targetFindings
      .map((f) => `[${f.agent}]: ${f.analysis.conclusion}\n理由: ${f.analysis.reasoning.join("; ")}`)
      .join("\n");
    const prompt = `${step.prompt ?? "审阅以下分析"}\n\n待审阅：\n${targetText}`;
    await this.invokeAgent(agentId, prompt, target, findings, [], onMessage, step);
  }

  private async execDebate(
    step: WorkflowStep,
    target: AnalysisTarget,
    findings: Finding[],
    onMessage: (msg: PendingMessage) => Promise<void>,
  ): Promise<void> {
    const agentMatches = (Array.isArray(step.agent) ? step.agent : [step.agent]).filter(Boolean) as {
      id: string;
    }[];
    const maxRounds = step.maxRounds ?? 2;
    const debateHistory: { agent: string; argument: string }[] = [];
    for (let r = 0; r < maxRounds; r++) {
      for (const match of agentMatches) {
        const othersText = debateHistory.map((e) => `[${e.agent}]: ${e.argument}`).join("\n");
        const prompt = `辩论轮次 ${r + 1}/${maxRounds}。${step.prompt ?? "就分析结论进行辩论"}\n${othersText ? `\n对方观点：\n${othersText}` : ""}`;
        const result = await this.invokeAgent(match.id, prompt, target, findings, [], onMessage, step);
        debateHistory.push({ agent: match.id, argument: result.conclusion });
      }
    }
  }

  private async invokeAgent(
    agentId: string,
    prompt: string,
    target: AnalysisTarget,
    findings: Finding[],
    history: { senderId: string; senderName: string; content: string }[],
    onMessage: (msg: PendingMessage) => Promise<void>,
    step?: WorkflowStep,
  ): Promise<{ conclusion: string }> {
    const llm = createLLM(this.options);
    const historyText = history.map((h) => `[${h.senderName}]: ${h.content}`).join("\n");
    const allFindingsText = findings
      .map((f) => `[${f.agent}](${f.analysis.sentiment}): ${f.analysis.conclusion}`)
      .join("\n");

    const systemPrompt = `你是${agentId}。请用中文回复。${step?.prompt ? `任务：${step.prompt.replace("{target}", target.name ?? target.code)}` : ""}
输出JSON格式：{"conclusion":"你的结论","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["论据1","论据2","论据3"]}`;

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(
        `${prompt}${historyText ? `\n\n对话历史：\n${historyText}` : ""}${allFindingsText ? `\n\n已有分析结论：\n${allFindingsText}` : ""}`,
      ),
    ];

    const response = await llm.invoke(messages);
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

    let conclusion = text.slice(0, 200);

    try {
      const parsed = parseLLMJson(text) as Record<string, unknown>;
      conclusion = (parsed.conclusion as string) ?? text.slice(0, 200);
      await onMessage({
        role: "agent",
        senderId: agentId,
        senderName: agentId,
        content: text,
        metadata: {
          type: "analysis",
          stepId: step?.id,
          isWorkflowStep: true,
          analysis: {
            conclusion,
            confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
            sentiment: parseSentiment(parsed.sentiment),
            reasoning: Array.isArray(parsed.reasoning)
              ? (parsed.reasoning as string[])
              : [(parsed.reasoning as string) ?? ""],
            rawOutput: text,
          },
        },
      });
    } catch {
      await onMessage({
        role: "agent",
        senderId: agentId,
        senderName: agentId,
        content: text,
        metadata: { type: "analysis", stepId: step?.id, isWorkflowStep: true },
      });
    }

    return { conclusion };
  }

  private inferLayer(step: WorkflowStep): string | undefined {
    if (step.id.startsWith("perception")) return "perception";
    if (step.id.startsWith("analysis")) return "analysis";
    if (step.id.startsWith("decision")) return "decision";
    if (step.id.startsWith("execution")) return "execution";
    return undefined;
  }
}
