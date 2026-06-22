import type { WorkflowDAG } from "../engine/types.js";
import { bullBearWorkflow } from "./bull-bear.js";
import { quickScanWorkflow } from "./quick-scan.js";
import { layeredWorkflow } from "./layered.js";

export const WORKFLOWS: Record<string, WorkflowDAG> = {
  "bull-bear": bullBearWorkflow,
  "quick-scan": quickScanWorkflow,
  "layered": layeredWorkflow,
};
