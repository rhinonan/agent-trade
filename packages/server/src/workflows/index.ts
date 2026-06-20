import type { WorkflowDAG } from "@agenttrade/core";
import { bullBearWorkflow } from "./bull-bear.js";
import { quickScanWorkflow } from "./quick-scan.js";

export const WORKFLOWS: Record<string, WorkflowDAG> = {
  "bull-bear": bullBearWorkflow,
  "quick-scan": quickScanWorkflow,
};
