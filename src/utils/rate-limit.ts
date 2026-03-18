interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  const timestamps = buckets.get(key) ?? [];

  // Remove expired timestamps
  const valid = timestamps.filter((ts) => now - ts < config.windowMs);

  if (valid.length >= config.maxRequests) {
    return false; // Rate limited
  }

  valid.push(now);
  buckets.set(key, valid);
  return true;
}

export const LIMITS = {
  contentDrop: { maxRequests: 10, windowMs: 60 * 60 * 1000 } as RateLimitConfig,
  poller: { maxRequests: 1, windowMs: 60 * 60 * 1000 } as RateLimitConfig,
};
