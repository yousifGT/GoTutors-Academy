/**
 * What each model costs, so the bench can put a price next to its accuracy.
 *
 * These are published list prices in US dollars per million tokens, as checked
 * on the date beside each one. They move, and this file does not move with
 * them — confirm on the provider's pricing page before quoting a figure to
 * anyone. A model missing from this table still runs; its cost shows as "?".
 */

export type Rates = {
  /** $ per million uncached input tokens. */
  input: number;
  /** $ per million output tokens, thinking/reasoning included. */
  output: number;
  /** $ per million input tokens served from the provider's cache. */
  cacheRead: number;
  /** $ per million input tokens written to the cache (Anthropic only charges extra for this). */
  cacheWrite: number;
  checked: string;
  /** A price change already announced, applied automatically from that date. */
  from?: { date: string; input: number; output: number; cacheRead: number };
};

export const RATES: Record<string, Rates> = {
  // Anthropic — cache writes are 1.25× input at the 5-minute TTL the app uses.
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, checked: "2026-09-26" },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, checked: "2026-09-26" },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, checked: "2026-09-26" },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25, checked: "2026-09-26" },

  // OpenAI — caching is automatic and writes cost nothing extra.
  "gpt-6-astra": { input: 10, output: 50, cacheRead: 1, cacheWrite: 10, checked: "2026-09-26" },
  "gpt-6-sol": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2, checked: "2026-09-26" },
  "gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.1, checked: "2026-09-26" },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0.75, checked: "2026-09-26" },

  // Google — prices for prompts under 200k tokens, which every marking request is.
  "gemini-3.8-flash": {
    input: 0.75,
    output: 3.75,
    cacheRead: 0.075,
    cacheWrite: 0.75,
    checked: "2026-09-26",
    // Introductory pricing ends on 31 December 2026.
    from: { date: "2027-01-01", input: 1.5, output: 7.5, cacheRead: 0.15 },
  },
  "gemini-3.1-pro-preview": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2, checked: "2026-09-26" },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cacheRead: 0.025, cacheWrite: 0.25, checked: "2026-09-26" },
};

/** Mid-market rate, as looked up on the date given. Override with --fx. */
export const USD_TO_GBP = 0.7545;
export const FX_CHECKED = "2026-09-26";

/** Tokens for one request, already split the same way for every provider. */
export type Usage = {
  /** Input tokens billed at the full rate. */
  input: number;
  cacheRead: number;
  cacheWrite: number;
  /** Output tokens, including any thinking/reasoning the provider bills as output. */
  output: number;
};

export function ratesFor(model: string, on: Date = new Date()): Rates | null {
  const r = RATES[model];
  if (!r) return null;
  if (r.from && on >= new Date(`${r.from.date}T00:00:00Z`)) {
    return { ...r, input: r.from.input, output: r.from.output, cacheRead: r.from.cacheRead, cacheWrite: r.from.input };
  }
  return r;
}

/**
 * The dollar cost of one request. Zero for a local model — the electricity is
 * real but not something this can measure. Null when the price isn't known.
 */
export function costUsd(model: string, usage: Usage, on: Date = new Date()): number | null {
  if (model.startsWith("local:")) return 0;
  const r = ratesFor(model, on);
  if (!r) return null;
  return (usage.input * r.input + usage.cacheRead * r.cacheRead + usage.cacheWrite * r.cacheWrite + usage.output * r.output) / 1e6;
}
