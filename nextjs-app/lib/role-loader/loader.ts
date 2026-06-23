import * as fs from "node:fs";
import * as path from "node:path";
import { load as parseYaml } from "js-yaml";
import { ChatPromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { AgentYamlSchema, type AgentYaml } from "./schema.js";
import { ZodError } from "zod";
import { toolsByName } from "@/lib/tools/index.js";
import type { ToolDefinition } from "@/lib/tools/index.js";

// ——— Types ———

export interface CompiledAgent {
  id: string;
  name: string;
  systemPrompt: ChatPromptTemplate;
  outputParser?: StructuredOutputParser<z.ZodTypeAny>;
  tools: ToolDefinition[];
  modelConfig?: { provider: string; model: string; temperature?: number };
  maxToolSteps: number;
}

// ——— Variable interpolation ———

/** Convert Jinja2-style {{var}} to LangChain {var} */
export function interpolateTemplate(template: string, vars: Record<string, string> = {}): string {
  let result = template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, "{$1}");
  // Also interpolate immediate values from vars
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

// ——— Zod schema from YAML field def ———

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

// ——— RoleLoader ———

export class RoleLoader {
  private agents = new Map<string, CompiledAgent>();

  // ========== Agent loading ==========

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

  // ========== Accessors ==========

  getAgent(id: string): CompiledAgent | undefined {
    return this.agents.get(id);
  }

  listAgents(): CompiledAgent[] {
    return Array.from(this.agents.values());
  }

  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  clear(): void {
    this.agents.clear();
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
