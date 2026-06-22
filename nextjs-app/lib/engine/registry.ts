import type { BaseAgent, AgentMatch, AgentCount } from "./types.js";

export class AgentRegistry {
  private agents = new Map<string, BaseAgent>();

  register(agent: BaseAgent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already registered`);
    }
    this.agents.set(agent.id, agent);
  }

  get(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  list(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  match(match: AgentMatch, count?: AgentCount | "all"): BaseAgent[] {
    let candidates = this.list();

    if (match.id) {
      const agent = this.agents.get(match.id);
      return agent ? [agent] : [];
    }

    if (match.capability) {
      candidates = candidates.filter(a =>
        a.capabilities.some(c =>
          c.toLowerCase().includes(match.capability!.toLowerCase())
        )
      );
    }

    if (match.not) {
      candidates = candidates.filter(a =>
        !match.not!.some(exclude =>
          a.capabilities.some(c => c.toLowerCase() === exclude.toLowerCase()) ||
          a.id === exclude
        )
      );
    }

    if (count === "all") return candidates;

    const min = count?.min ?? 1;
    const max = count?.max ?? candidates.length;
    const n = Math.max(min, Math.min(max, candidates.length));
    return candidates.slice(0, n);
  }

  clear(): void {
    this.agents.clear();
  }

  get size(): number {
    return this.agents.size;
  }
}
