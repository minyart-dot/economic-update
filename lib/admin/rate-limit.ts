// In-memory sliding-window limiter (same best-effort approach as app/api/subscribe/route.ts:
// per server instance, so it slows guessing rather than guaranteeing a hard cap).

export interface RateLimiter {
  /** Records one hit for `key` and returns true when the key is over the limit. */
  hit(key: string, now?: number): boolean;
  /** True when the key is already over the limit, without recording a hit. */
  blocked(key: string, now?: number): boolean;
  reset(key: string): void;
}

export function createRateLimiter(opts: { windowMs: number; max: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  const recent = (key: string, now: number) => (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  return {
    hit(key, now = Date.now()) {
      const r = recent(key, now);
      r.push(now);
      hits.set(key, r);
      if (hits.size > (opts.maxKeys ?? 5000)) {
        for (const [k, v] of hits) if (!v.some((t) => now - t < opts.windowMs)) hits.delete(k);
      }
      return r.length > opts.max;
    },
    blocked(key, now = Date.now()) {
      return recent(key, now).length >= opts.max;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

/** Client IP as the hosting proxy (Render) reports it (first x-forwarded-for entry), or "unknown". */
export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip")?.trim() || "unknown";
}
