import type { FunnelEvent } from "./types";

// Imperative event bus between the realtime channel and the render loop.
// The scene consumes events inside useFrame via drain() — zero React state in
// the hot path. A token bucket coalesces bursts (5k-task drains, campaign
// blasts): over-budget events fold into the newest event's magnitude instead
// of queueing thousands of renders.

const MAX_QUEUE = 200;
const TOKENS_PER_SEC = 10;

export class FunnelEventBus {
  private queue: FunnelEvent[] = [];
  private tokens = TOKENS_PER_SEC;
  private lastRefill = performance.now();
  private listeners = new Set<(event: FunnelEvent) => void>();

  emit(event: FunnelEvent) {
    const now = performance.now();
    this.tokens = Math.min(
      TOKENS_PER_SEC,
      this.tokens + ((now - this.lastRefill) / 1000) * TOKENS_PER_SEC
    );
    this.lastRefill = now;

    if (this.tokens >= 1 && this.queue.length < MAX_QUEUE) {
      this.tokens -= 1;
      this.queue.push(event);
    } else {
      // Fold into the newest same-type event → one big pulse instead of N
      const last = [...this.queue].reverse().find((e) => {
        if (e.type !== event.type) return false;
        if ("agentKey" in e && "agentKey" in event) return e.agentKey === event.agentKey;
        return true;
      });
      if (last) last.magnitude += event.magnitude;
      else if (this.queue.length < MAX_QUEUE) this.queue.push(event);
    }
    this.listeners.forEach((l) => l(event));
  }

  // Scene drains ≤n events per frame tick
  drain(n = 2): FunnelEvent[] {
    return this.queue.splice(0, n);
  }

  onEvent(listener: (event: FunnelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
