import * as fs from "node:fs";
import * as path from "node:path";
import { load as parseYaml } from "js-yaml";
import { ChatPromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { AgentYamlSchema, WorkflowYamlSchema, type AgentYaml, type WorkflowYaml } from "./schema.js";
import { ZodError } from "zod";
import { toolsByName } from "@/lib/tools/index.js";
import type { ToolDefinition } from "@/lib/tools/index.js";

/**
 * 角色加载器 — YAML 编译器，将 YAML 配置编译为可执行的 CompiledAgent。
 *
 * 编译流水线：
 *   YAML 文本 → js-yaml 解析 → Zod 校验 → compileAgent()
 *                                              │
 *                                              ├─ interpolateTemplate() — {{var}} → {var}
 *                                              ├─ ChatPromptTemplate.fromMessages()
 *                                              ├─ buildOutputParser() — 递归构建 Zod schema
 *                                              └─ toolsByName.get(name) — 解析工具引用
 *
 * 支持三种加载来源：
 * 1. 文件系统扫描（scanAgents / scanWorkflows）— 加载内建角色
 * 2. 直接 YAML 字符串（loadAgentYaml / loadWorkflowYaml）— 用于用户上传
 * 3. 数据库加载（loadFromDB）— 加载用户自定义角色，含跨用户隔离机制
 */

// ——— 类型定义 ———

/** 编译后的 Agent — 包含已解析的 prompt 模板、输出解析器、工具列表等运行时所需全部信息 */
export interface CompiledAgent {
  id: string;
  name: string;
  systemPrompt: ChatPromptTemplate;
  outputParser?: StructuredOutputParser<z.ZodTypeAny>;
  tools: ToolDefinition[];
  modelConfig?: { provider: string; model: string; temperature?: number };
  maxToolSteps: number;
}

// ——— 模板变量插值 ———

/** 将 Jinja2 风格的 {{var}} 转换为 LangChain 风格的 {var} */
export function interpolateTemplate(template: string, vars: Record<string, string> = {}): string {
  let result = template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, "{$1}");
  // Also interpolate immediate values from vars
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

// ——— YAML 字段定义 → Zod schema ———

/** 将 YAML output_schema 中的单个字段定义转为 Zod schema。支持 string/number/boolean/array 类型及 min/max/enum 约束。 */
function fieldToZod(def: { type: string; description?: string; min?: number; max?: number; enum?: string[]; items?: { type: string } }): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (def.type) {
    case "string":
      base = z.string();
      break;
    case "number":
      base = z.number();
      if (def.min !== undefined) base = (base as z.ZodNumber).min(def.min);
      if (def.max !== undefined) base = (base as z.ZodNumber).max(def.max);
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "array":
      base = z.array(def.items?.type === "number" ? z.number() : z.string());
      break;
    default:
      base = z.string();
  }
  if (def.description) base = base.describe(def.description);
  if (def.enum) {
    // For string enums, use z.enum; for other types, skip enum constraint
    if (def.type === "string") {
      base = z.enum(def.enum as [string, ...string[]]);
      if (def.description) base = base.describe(def.description);
    }
  }
  return base;
}

function buildOutputParser(schema: Record<string, unknown> | undefined): StructuredOutputParser<z.ZodTypeAny> | undefined {
  if (!schema) return undefined;
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of Object.entries(schema)) {
    shape[key] = fieldToZod(def as { type: string });
  }
  return StructuredOutputParser.fromZodSchema(z.object(shape));
}

// ——— RoleLoader 类 ———
// 核心编译器，管理所有已加载的 agent 和 workflow

/**
 * 角色加载器 — 管理 agent 和 workflow 的编译、缓存和查询。
 *
 * 使用模块级单例模式（getRoleLoader / resetRoleLoader），
 * 确保整个应用中只有一个 RoleLoader 实例。
 */
export class RoleLoader {
  private agents = new Map<string, CompiledAgent>();
  private workflows = new Map<string, WorkflowYaml>();

  /** Track IDs loaded from per-user DB so they can be cleared between users */
  private dbLoadedAgentIds = new Set<string>();
  private dbLoadedWorkflowIds = new Set<string>();

  // ========== Agent 加载 ==========

  async scanAgents(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      console.warn(`[RoleLoader] Agent directory not found: ${dir}`);
      return;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    for (const file of files) {
      const filepath = path.join(dir, file);
      try {
        const raw = fs.readFileSync(filepath, "utf-8");
        await this.loadAgentYaml(raw, `file:${file}`);
      } catch (err) {
        // ZodError = validation failure → log and skip, continue loading others
        if (err instanceof ZodError) {
          console.error(`[RoleLoader] Failed to load agent from ${file}: ${err.message}`);
          continue;
        }
        // YAML parse errors and other fatal errors → propagate
        throw err;
      }
    }
  }

  async loadAgentYaml(raw: string, source: string): Promise<CompiledAgent> {
    const parsed = parseYaml(raw);
    const validated = AgentYamlSchema.parse(parsed);
    const compiled = this.compileAgent(validated);

    // If loading from DB, track for per-user cleanup
    if (source.startsWith("db:")) {
      // Remove the previous DB-loaded entry for this ID if it exists
      if (this.dbLoadedAgentIds.has(compiled.id)) {
        this.agents.delete(compiled.id);
      }
      this.dbLoadedAgentIds.add(compiled.id);
    }

    this.agents.set(compiled.id, compiled);
    return compiled;
  }

  private compileAgent(yaml: AgentYaml): CompiledAgent {
    const interpolatedPrompt = interpolateTemplate(yaml.system_prompt);

    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(interpolatedPrompt),
    ]);

    const outputParser = buildOutputParser(yaml.output_schema as Record<string, unknown> | undefined);

    const tools: ToolDefinition[] = (yaml.tools ?? [])
      .map((name) => {
        const tool = toolsByName.get(name);
        if (!tool) {
          console.warn(`[RoleLoader] Tool "${name}" not found for agent "${yaml.id}"`);
        }
        return tool;
      })
      .filter((t): t is ToolDefinition => t != null);

    return {
      id: yaml.id,
      name: yaml.name,
      systemPrompt: prompt,
      outputParser,
      tools,
      modelConfig: yaml.model,
      maxToolSteps: yaml.max_tool_steps,
    };
  }

  // ========== Workflow 加载 ==========

  async scanWorkflows(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      console.warn(`[RoleLoader] Workflow directory not found: ${dir}`);
      return;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    for (const file of files) {
      const filepath = path.join(dir, file);
      try {
        const raw = fs.readFileSync(filepath, "utf-8");
        await this.loadWorkflowYaml(raw, `file:${file}`);
      } catch (err) {
        if (err instanceof ZodError) {
          console.error(`[RoleLoader] Failed to load workflow from ${file}: ${err.message}`);
          continue;
        }
        throw err;
      }
    }
  }

  async loadWorkflowYaml(raw: string, source: string): Promise<WorkflowYaml> {
    const parsed = parseYaml(raw);
    const validated = WorkflowYamlSchema.parse(parsed);

    // If loading from DB, track for per-user cleanup
    if (source.startsWith("db:")) {
      if (this.dbLoadedWorkflowIds.has(validated.name)) {
        this.workflows.delete(validated.name);
      }
      this.dbLoadedWorkflowIds.add(validated.name);
    }

    this.workflows.set(validated.name, validated);
    return validated;
  }

  // ========== 数据库加载（用户自定义角色）==========

  /**
   * 清除所有从数据库加载的角色。
   * 必须在切换用户前调用，防止跨用户数据泄漏。
   * 同时清除 agent 和 workflow 的 DB 加载记录。
   */
  clearDBRoles(): void {
    for (const id of this.dbLoadedAgentIds) {
      this.agents.delete(id);
    }
    this.dbLoadedAgentIds.clear();

    for (const name of this.dbLoadedWorkflowIds) {
      this.workflows.delete(name);
    }
    this.dbLoadedWorkflowIds.clear();
  }

  async loadFromDB(userId: string): Promise<void> {
    // Clear any previously loaded DB roles (from a different user)
    this.clearDBRoles();

    const { RoleRepo } = await import("./repo.js");
    const { getDb } = await import("../db/client.js");

    const repo = new RoleRepo(getDb());
    const agentRoles = repo.listByUser(userId, "agent");
    const workflowRoles = repo.listByUser(userId, "workflow");

    for (const role of agentRoles) {
      try {
        await this.loadAgentYaml(role.yamlContent, `db:${userId}/${role.id}`);
      } catch (err) {
        console.error(`[RoleLoader] Failed to load user agent "${role.id}":`, err);
      }
    }

    for (const role of workflowRoles) {
      try {
        await this.loadWorkflowYaml(role.yamlContent, `db:${userId}/${role.id}`);
      } catch (err) {
        console.error(`[RoleLoader] Failed to load user workflow "${role.id}":`, err);
      }
    }
  }

  // ========== 查询接口 ==========

  getAgent(id: string): CompiledAgent | undefined {
    return this.agents.get(id);
  }

  listAgents(): CompiledAgent[] {
    return Array.from(this.agents.values());
  }

  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  getWorkflow(name: string): WorkflowYaml | undefined {
    return this.workflows.get(name);
  }

  listWorkflows(): WorkflowYaml[] {
    return Array.from(this.workflows.values());
  }

  hasWorkflow(name: string): boolean {
    return this.workflows.has(name);
  }

  clear(): void {
    this.agents.clear();
    this.workflows.clear();
    this.dbLoadedAgentIds.clear();
    this.dbLoadedWorkflowIds.clear();
  }
}

// Singleton
let _instance: RoleLoader | undefined;

export function getRoleLoader(): RoleLoader {
  if (!_instance) _instance = new RoleLoader();
  return _instance;
}

export function resetRoleLoader(): void {
  _instance = undefined;
}
