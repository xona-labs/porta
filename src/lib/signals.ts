import type { StockSignal } from "../types";

/**
 * Fetches the latest stock signals from the Xona signal feed.
 * The feed is refreshed continuously by Xona's signal cron; this endpoint
 * serves the newest signal per tracked ticker.
 */
export async function fetchLatestSignals(apiBase: string): Promise<Map<string, StockSignal>> {
  const res = await fetch(`${apiBase}/api/signals/stocks/latest`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`signal feed returned ${res.status}`);
  const body: unknown = await res.json();

  const rows = extractRows(body);
  const out = new Map<string, StockSignal>();
  for (const row of rows) {
    const sig = normalize(row);
    if (sig) out.set(sig.ticker, sig);
  }
  return out;
}

function extractRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const data = (body as Record<string, unknown>).data ?? (body as Record<string, unknown>).signals;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (data && typeof data === "object") return Object.values(data) as Record<string, unknown>[];
  }
  return [];
}

function normalize(row: Record<string, unknown>): StockSignal | null {
  // Rows may be the signal itself or a training wrapper holding it.
  const raw = (row.signal ?? row.data ?? row) as Record<string, unknown>;
  const tokenized = (raw.tokenized ?? {}) as Record<string, unknown>;

  const tickerRaw = typeof raw.ticker === "string" ? raw.ticker : "";
  if (!tickerRaw) return null;
  // Feed keys stocks as "AAPLX" / "AAPL-RH"; reduce to the underlying ticker.
  const ticker = tickerRaw.toUpperCase().replace(/-RH$/, "").replace(/X$/, "");

  return {
    ticker,
    sentiment: str(raw.sentiment) ?? "neutral",
    sentiment_score: num(raw.sentiment_score) ?? 0,
    confidence: num(raw.confidence) ?? 0,
    summary: str(raw.summary),
    onchain_price: num(tokenized.onchain_price),
    premium_discount_pct: num(tokenized.premium_discount_pct),
    generated_at: str(raw.generated_at),
  };
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
