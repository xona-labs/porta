import type { BasketEntry, PortfolioConfig } from "../types";

export async function getConfig(db: D1Database, userId: string): Promise<PortfolioConfig | null> {
  const row = await db
    .prepare("SELECT * FROM config WHERE user_id = ?1")
    .bind(userId)
    .first<{
      user_id: string;
      basket: string;
      daily_budget_usd: number;
      max_per_tx_usd: number;
      max_per_day_usd: number;
      paused: number;
    }>();
  if (!row) return null;
  return {
    user_id: row.user_id,
    basket: JSON.parse(row.basket) as BasketEntry[],
    daily_budget_usd: row.daily_budget_usd,
    max_per_tx_usd: row.max_per_tx_usd,
    max_per_day_usd: row.max_per_day_usd,
    paused: row.paused === 1,
  };
}

export async function saveConfig(
  db: D1Database,
  userId: string,
  cfg: Omit<PortfolioConfig, "user_id">
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO config (user_id, basket, daily_budget_usd, max_per_tx_usd, max_per_day_usd, paused, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(user_id) DO UPDATE SET
         basket = ?2, daily_budget_usd = ?3, max_per_tx_usd = ?4,
         max_per_day_usd = ?5, paused = ?6, updated_at = ?7`
    )
    .bind(
      userId,
      JSON.stringify(cfg.basket),
      cfg.daily_budget_usd,
      cfg.max_per_tx_usd,
      cfg.max_per_day_usd,
      cfg.paused ? 1 : 0,
      new Date().toISOString()
    )
    .run();
}

/** USD spent by this user in the trailing 24 hours. Backs the durable daily cap. */
export async function spentLast24h(db: D1Database, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const row = await db
    .prepare("SELECT COALESCE(SUM(usd), 0) AS total FROM spend WHERE user_id = ?1 AND ts >= ?2")
    .bind(userId, since)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export interface TradeRecord {
  ticker: string;
  side: "buy" | "sell";
  usd: number;
  qty: number;
  price_usd: number;
  tx_sig: string | null;
  dry_run: boolean;
  reasoning: string;
}

export async function recordTrade(db: D1Database, userId: string, t: TradeRecord): Promise<number> {
  const ts = new Date().toISOString();
  const res = await db
    .prepare(
      `INSERT INTO trades (user_id, ts, ticker, side, usd, qty, price_usd, tx_sig, dry_run, reasoning)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    )
    .bind(userId, ts, t.ticker, t.side, t.usd, t.qty, t.price_usd, t.tx_sig, t.dry_run ? 1 : 0, t.reasoning)
    .run();
  const tradeId = res.meta.last_row_id;

  if (t.side === "buy") {
    await db
      .prepare(
        `INSERT INTO lots (user_id, ticker, opened_at, qty, qty_remaining, cost_usd, trade_id)
         VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)`
      )
      .bind(userId, t.ticker, ts, t.qty, t.usd, tradeId)
      .run();
  }
  if (!t.dry_run) {
    await db
      .prepare("INSERT INTO spend (user_id, ts, usd, kind) VALUES (?1, ?2, ?3, 'swap')")
      .bind(userId, ts, t.usd)
      .run();
  }
  return tradeId;
}

export async function logCycle(
  db: D1Database,
  userId: string | null,
  status: string,
  detail: unknown
): Promise<void> {
  await db
    .prepare("INSERT INTO cycles (user_id, ts, status, detail) VALUES (?1, ?2, ?3, ?4)")
    .bind(userId, new Date().toISOString(), status, JSON.stringify(detail))
    .run();
}

export interface Holding {
  ticker: string;
  qty: number;
  cost_usd: number;
}

export async function getHoldings(db: D1Database, userId: string): Promise<Holding[]> {
  const { results } = await db
    .prepare(
      `SELECT ticker, SUM(qty_remaining) AS qty,
              SUM(cost_usd * qty_remaining / qty) AS cost_usd
       FROM lots WHERE user_id = ?1 AND qty_remaining > 0 GROUP BY ticker`
    )
    .bind(userId)
    .all<Holding>();
  return results ?? [];
}

export async function snapshotEquity(
  db: D1Database,
  userId: string,
  cash: number,
  breakdown: { ticker: string; qty: number; value_usd: number }[]
): Promise<void> {
  const holdings = breakdown.reduce((s, b) => s + b.value_usd, 0);
  await db
    .prepare(
      `INSERT INTO equity_snapshots (user_id, ts, cash_usd, holdings_usd, total_usd, breakdown)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(userId, new Date().toISOString(), cash, holdings, cash + holdings, JSON.stringify(breakdown))
    .run();
}
