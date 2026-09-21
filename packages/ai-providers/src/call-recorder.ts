import type { Usage } from './types.js';

export interface CallRecorder {
  record(usage: Usage): void;
  all(): Usage[];
  totals(): { calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number; latencyMs: number };
}

/** In-memory usage recorder feeding the Cost Engine + Observability (§53/§56). */
export class InMemoryCallRecorder implements CallRecorder {
  private items: Usage[] = [];
  record(usage: Usage): void {
    this.items.push(usage);
  }
  all(): Usage[] {
    return [...this.items];
  }
  totals() {
    return this.items.reduce(
      (acc, u) => ({
        calls: acc.calls + 1,
        inputTokens: acc.inputTokens + (u.inputTokens ?? 0),
        outputTokens: acc.outputTokens + (u.outputTokens ?? 0),
        estimatedCostUsd: acc.estimatedCostUsd + u.estimatedCostUsd,
        latencyMs: acc.latencyMs + u.latencyMs,
      }),
      { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 0 },
    );
  }
}

export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
