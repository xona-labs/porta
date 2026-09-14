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

export interface Holding {
  ticker: string;
  qty: number;
  cost_usd: number;
}

export interface Portfolio {
  deposit_address: string;
  cash_usd: number | null;
  holdings: Holding[];
  spent_last_24h_usd: number;
  caps: { max_per_tx_usd: number; max_per_day_usd: number } | null;
}

export interface Trade {
  id: number;
  ts: string;
  ticker: string;
  side: string;
  usd: number;
  qty: number;
  price_usd: number;
  tx_sig: string | null;
  dry_run: number;
  reasoning: string;
}

export interface Cycle {
  id: number;
  ts: string;
  status: string;
  detail: string;
}

export interface EquitySnapshot {
  ts: string;
  cash_usd: number;
  holdings_usd: number;
  total_usd: number;
}

export interface Signal {
  ticker: string;
  sentiment: string;
  sentiment_score: number;
  confidence: number;
  summary?: string;
  onchain_price: number | null;
  premium_discount_pct: number | null;
}

export interface XStock {
  ticker: string;
  symbol: string;
  name: string;
  mint: string;
}

export interface AuthResult {
  token: string;
  user_id: string;
  deposit_address: string;
  is_new: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.body) headers["content-type"] = "application/json";
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `request failed (${res.status})`);
  return body as T;
}

export const api = {
  universe: () => request<{ stocks: XStock[] }>("/api/universe"),
  signals: () => request<{ signals: Record<string, Signal> }>("/api/signals"),
  authPrivy: (accessToken: string, email?: string) =>
    request<AuthResult>("/api/auth/privy", {
      method: "POST",
      body: JSON.stringify({ access_token: accessToken, email }),
    }),
  me: (token: string) => request<{ user: { id: string; wallet_pubkey: string } }>("/api/me", {}, token),
  config: (token: string) => request<{ config: PortfolioConfig | null }>("/api/me/config", {}, token),
  saveConfig: (token: string, cfg: Omit<PortfolioConfig, "user_id">) =>
    request<{ ok: boolean }>("/api/me/config", { method: "PUT", body: JSON.stringify(cfg) }, token),
  portfolio: (token: string) => request<Portfolio>("/api/me/portfolio", {}, token),
  trades: (token: string) => request<{ trades: Trade[] }>("/api/me/trades?limit=50", {}, token),
  cycles: (token: string) => request<{ cycles: Cycle[] }>("/api/me/cycles?limit=30", {}, token),
  equity: (token: string) => request<{ snapshots: EquitySnapshot[] }>("/api/me/equity", {}, token),
};

const TOKEN_KEY = "porta_token";

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
