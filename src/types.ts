export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DRY_RUN: string;
  SIGNAL_API_BASE: string;
  MAX_PREMIUM_PCT: string;
  SLIPPAGE_BPS: string;
  /** Privy app id for email login. */
  PRIVY_APP_ID?: string;
  /** 32-byte base64 key encrypting per-user agent wallet secrets. */
  MASTER_KEY?: string;
  /** When set, POST /api/cycle/run requires this bearer token. */
  ADMIN_TOKEN?: string;
  SOLANA_RPC_URL?: string;
}

export interface BasketEntry {
  ticker: string;
  weight: number;
}

export interface PortfolioConfig {
  user_id: string;
  basket: BasketEntry[];
  daily_budget_usd: number;
  max_per_tx_usd: number;
  max_per_day_usd: number;
  paused: boolean;
}

/** The slice of a Xona stock signal that drives a decision. */
export interface StockSignal {
  ticker: string;
  sentiment: string;
  sentiment_score: number;
  confidence: number;
  summary?: string;
  onchain_price: number | null;
  premium_discount_pct: number | null;
  generated_at?: string;
}

export interface Decision {
  ticker: string;
  action: "buy" | "skip";
  usd: number;
  reason: string;
  signal?: StockSignal;
}
