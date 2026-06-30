// lib/role-loader/schema.ts

/**
 * Agent / Workflow YAML 的 Zod 校验 Schema。
 *
 * 此文件定义了所有 YAML 配置文件的结构校验规则：
 * - AgentYamlSchema — 校验 roles/agents/*.yaml（agent 角色定义）
 * - WorkflowYamlSchema — 校验 roles/workflows/*.yaml（工作流定义）
 *
 * WorkflowYamlSchema 包含两个 refine 校验：
 * 1. 节点 ID 必须唯一
 * 2. depends_on 中引用的节点必须存在
 */

import { z } from "zod";

// ——— 字段 Schema（output_schema 的值类型）———
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

// ——— Agent YAML 校验 ———
// 校验 roles/agents/*.yaml 的结构
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

// ——— Workflow 节点定义 ———
/** 节点基础 Schema — 所有节点共享的字段 */
const BaseNodeSchema = z.object({
  id: z.string().min(1),
  agent: z.string().min(1),
  prompt: z.string().optional(),
  depends_on: z.array(z.string()).optional().default([]),
});

/** 辩论节点 Schema — 包含参与者、最大轮次、终止条件等辩论专用字段 */
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

/** 标准节点 Schema — 默认节点类型 */
const StandardNodeSchema = BaseNodeSchema.extend({
  type: z.literal("standard").optional().default("standard"),
});

/** 通过 type 字段区分标准节点和辩论节点的判别联合 */
const WorkflowNodeSchema = z.discriminatedUnion("type", [
  StandardNodeSchema,
  DebateNodeSchema,
]);

// ——— Workflow YAML 校验 ———
// 校验 roles/workflows/*.yaml 的结构
// 包含两个 refine 校验：节点 ID 唯一性 + depends_on 引用有效性
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
