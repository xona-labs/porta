import type { BasketEntry, PortfolioConfig } from "../types";

export async function getConfig(db: D1Database): Promise<PortfolioConfig | null> {
  const row = await db.prepare("SELECT * FROM config WHERE id = 'default'").first<{
    id: string;
    basket: string;
    daily_budget_usd: number;
    max_per_tx_usd: number;
    max_per_day_usd: number;
    paused: number;
  }>();
  if (!row) return null;
  return {
    id: row.id,
    basket: JSON.parse(row.basket) as BasketEntry[],
    daily_budget_usd: row.daily_budget_usd,
    max_per_tx_usd: row.max_per_tx_usd,
    max_per_day_usd: row.max_per_day_usd,
    paused: row.paused === 1,
  };
}

export async function saveConfig(db: D1Database, cfg: Omit<PortfolioConfig, "id">): Promise<void> {
  await db
    .prepare(
      `INSERT INTO config (id, basket, daily_budget_usd, max_per_tx_usd, max_per_day_usd, paused, updated_at)
       VALUES ('default', ?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET
         basket = ?1, daily_budget_usd = ?2, max_per_tx_usd = ?3,
         max_per_day_usd = ?4, paused = ?5, updated_at = ?6`
    )
    .bind(
      JSON.stringify(cfg.basket),
      cfg.daily_budget_usd,
      cfg.max_per_tx_usd,
      cfg.max_per_day_usd,
      cfg.paused ? 1 : 0,
      new Date().toISOString()
    )
    .run();
}

/** USD spent in the trailing 24 hours. Backs the durable daily cap. */
export async function spentLast24h(db: D1Database): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const row = await db
    .prepare("SELECT COALESCE(SUM(usd), 0) AS total FROM spend WHERE ts >= ?1")
    .bind(since)
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

export async function recordTrade(db: D1Database, t: TradeRecord): Promise<number> {
  const ts = new Date().toISOString();
  const res = await db
    .prepare(
      `INSERT INTO trades (ts, ticker, side, usd, qty, price_usd, tx_sig, dry_run, reasoning)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
    .bind(ts, t.ticker, t.side, t.usd, t.qty, t.price_usd, t.tx_sig, t.dry_run ? 1 : 0, t.reasoning)
    .run();
  const tradeId = res.meta.last_row_id;

  if (t.side === "buy") {
    await db
      .prepare(
        `INSERT INTO lots (ticker, opened_at, qty, qty_remaining, cost_usd, trade_id)
         VALUES (?1, ?2, ?3, ?3, ?4, ?5)`
      )
      .bind(t.ticker, ts, t.qty, t.usd, tradeId)
      .run();
  }
  if (!t.dry_run) {
    await db.prepare("INSERT INTO spend (ts, usd, kind) VALUES (?1, ?2, 'swap')").bind(ts, t.usd).run();
  }
  return tradeId;
}

export async function logCycle(db: D1Database, status: string, detail: unknown): Promise<void> {
  await db
    .prepare("INSERT INTO cycles (ts, status, detail) VALUES (?1, ?2, ?3)")
    .bind(new Date().toISOString(), status, JSON.stringify(detail))
    .run();
}

export interface Holding {
  ticker: string;
  qty: number;
  cost_usd: number;
}

export async function getHoldings(db: D1Database): Promise<Holding[]> {
  const { results } = await db
    .prepare(
      `SELECT ticker, SUM(qty_remaining) AS qty,
              SUM(cost_usd * qty_remaining / qty) AS cost_usd
       FROM lots WHERE qty_remaining > 0 GROUP BY ticker`
    )
    .all<Holding>();
  return results ?? [];
}

export async function snapshotEquity(
  db: D1Database,
  cash: number,
  breakdown: { ticker: string; qty: number; value_usd: number }[]
): Promise<void> {
  const holdings = breakdown.reduce((s, b) => s + b.value_usd, 0);
  await db
    .prepare(
      `INSERT INTO equity_snapshots (ts, cash_usd, holdings_usd, total_usd, breakdown)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
    .bind(new Date().toISOString(), cash, holdings, cash + holdings, JSON.stringify(breakdown))
    .run();
}
