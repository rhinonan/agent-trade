import type { BaseAgent } from "./types.js";
import { AgentRegistry } from "./registry.js";

/**
 * Auto-discover and register agents from a list of constructors.
 * In Phase 1, agents are explicitly imported and passed.
 * Phase 2+ could add filesystem scanning for plugin directories.
 */
export function loadAgents(
  registry: AgentRegistry,
  agentFactories: (new () => BaseAgent)[]
): void {
  for (const Factory of agentFactories) {
    const agent = new Factory();
    registry.register(agent);
  }
}

/**
 * Register multiple pre-instantiated agents (useful for same-class variants).
 */
export function registerInstances(
  registry: AgentRegistry,
  agents: BaseAgent[]
): void {
  for (const agent of agents) {
    registry.register(agent);
  }
}
