// lib/data-sdk/utils.ts
// A 股数据 SDK 共享工具函数 — 代码标准化、GBK 解码、速率限制、超时 fetch

// ─── Ticker normalization ───

/** Normalize any ticker format to pure 6-digit code. */
export function normalizeCode(code: string): string {
  // Strip whitespace
  let c = code.trim().toUpperCase();
  // Strip prefix: SH688017 → 688017, SZ000001 → 000001, BJ832000 → 832000
  if (/^[A-Z]{2}\d{6}$/.test(c)) {
    c = c.slice(2);
  }
  // Strip suffix: 688017.SH → 688017
  if (/^\d{6}\.[A-Z]{2}$/.test(c)) {
    c = c.slice(0, 6);
  }
  // Validate
  if (!/^\d{6}$/.test(c)) {
    throw new Error(`Invalid stock code: "${code}" → "${c}"`);
  }
  return c;
}

/** Determine market prefix for a 6-digit code. */
export function getPrefix(code: string): "sh" | "sz" | "bj" {
  const c = normalizeCode(code);
  if (c.startsWith("6") || c.startsWith("9")) return "sh";
  if (c.startsWith("8")) return "bj";
  return "sz";
}

/** Build full secid for eastmoney APIs: "1.600519" or "0.000001" */
export function toSecId(code: string): string {
  const c = normalizeCode(code);
  const market = getPrefix(c) === "sh" ? "1" : getPrefix(c) === "bj" ? "0" : "0";
  return `${market}.${c}`;
}

/** Build Tencent-prefixed code: "sh600519", "sz000001", "bj832000" */
export function toTencentCode(code: string): string {
  return getPrefix(code) + normalizeCode(code);
}

// ─── GBK decoding ───

/**
 * Decode a GBK-encoded ArrayBuffer to a UTF-8 string.
 * Node.js 18+ supports TextDecoder('gbk').
 */
export function decodeGBK(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder("gbk");
  return decoder.decode(buffer);
}

// ─── Rate limiter (for eastmoney) ───

export class RateLimiter {
  private lastCall = 0;

  constructor(
    private minIntervalMs: number = 1000,
    private jitterMs: number = 500,
  ) {}

  /**
   * Wait until the rate limit interval has passed since the last call.
   * Updates lastCall immediately (before waiting) to prevent concurrent
   * invocations from both passing the rate check — avoids a TOCTOU race
   * where two async calls read the old timestamp before either updates it.
   */
  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastCall;
    this.lastCall = Date.now(); // Set immediately to prevent concurrent passes
    const wait = this.minIntervalMs - elapsed;
    if (wait > 0) {
      const jitter = Math.random() * this.jitterMs;
      await new Promise((r) => setTimeout(r, wait + jitter));
    }
  }

  /** @deprecated wait() now updates lastCall immediately; separate mark() is no longer needed. */
  mark(): void {
    // No-op: lastCall is now set in wait() to close the TOCTOU window.
  }
}

// ─── Fetch with timeout ───

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs: number = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
