// nextjs-app/lib/role-loader/schema.ts
import { z } from "zod";

// ——— Field Schema (output_schema values) ———
const SUPPORTED_TYPES = ["string", "number", "boolean", "array"] as const;

export const FieldSchema = z.object({
  type: z.enum(SUPPORTED_TYPES),
  description: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  enum: z.array(z.string()).optional(),
  items: z.object({ type: z.string() }).optional(),
});

export type FieldDef = z.infer<typeof FieldSchema>;

// ——— Agent YAML ———
export const AgentYamlSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  system_prompt: z.string().min(1),
  tools: z.array(z.string()).optional().default([]),
  output_schema: z.record(z.string(), FieldSchema).optional(),
  model: z.object({
    provider: z.enum(["deepseek", "openai", "anthropic"]),
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
  }).optional(),
  max_tool_steps: z.number().int().min(1).max(20).optional().default(5),
});

export type AgentYaml = z.infer<typeof AgentYamlSchema>;

// ——— Workflow Node ———
const BaseNodeSchema = z.object({
  id: z.string().min(1),
  agent: z.string().min(1),
  prompt: z.string().optional(),
  depends_on: z.array(z.string()).optional().default([]),
});

const DebateNodeSchema = BaseNodeSchema.extend({
  type: z.literal("debate"),
  agent: z.string().optional(),
  prompt: z.undefined().optional(),
  participants: z.array(z.object({
    agent: z.string().min(1),
    role: z.string().min(1),
    first: z.boolean().optional().default(false),
  })).min(2),
  max_rounds: z.number().int().min(1).max(50).optional().default(10),
  stop_when: z.object({
    field: z.string().min(1),
    condition: z.enum(["any", "all"]),
  }),
  prompt_template: z.string().min(1),
});

const StandardNodeSchema = BaseNodeSchema.extend({
  type: z.literal("standard").optional().default("standard"),
});

const WorkflowNodeSchema = z.discriminatedUnion("type", [
  StandardNodeSchema,
  DebateNodeSchema,
]);

// ——— Workflow YAML ———
export const WorkflowYamlSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional().default("1.0"),
  nodes: z.array(WorkflowNodeSchema)
    .min(1)
    .refine(
      (nodes) => {
        const ids = nodes.map((n) => n.id);
        return new Set(ids).size === ids.length;
      },
      { message: "Node ids must be unique" },
    )
    .refine(
      (nodes) => {
        const allIds = new Set(nodes.map((n) => n.id));
        for (const n of nodes) {
          for (const dep of (n.depends_on ?? [])) {
            if (!allIds.has(dep)) return false;
          }
        }
        return true;
      },
      { message: "depends_on must reference existing node ids" },
    ),
});

export type WorkflowYaml = z.infer<typeof WorkflowYamlSchema>;
export type WorkflowNode = WorkflowYaml["nodes"][number];
