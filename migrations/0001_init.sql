-- Porta core schema.
-- Money amounts are stored in USD with 6 decimal places (USDC atoms / 1e6)
-- kept as REAL for reporting simplicity; token quantities as REAL in human units.

-- Portfolio configuration: one row ("default") for the hackathon build.
CREATE TABLE config (
  id TEXT PRIMARY KEY,
  -- JSON: [{ "ticker": "AAPL", "weight": 0.25 }, ...] weights sum to 1
  basket TEXT NOT NULL,
  daily_budget_usd REAL NOT NULL,
  max_per_tx_usd REAL NOT NULL,
  max_per_day_usd REAL NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Every executed (or dry-run) trade, with the full reasoning that justified it.
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  usd REAL NOT NULL,
  qty REAL NOT NULL,
  price_usd REAL NOT NULL,
  tx_sig TEXT,
  dry_run INTEGER NOT NULL DEFAULT 0,
  -- Snapshot of the decision inputs: signal sentiment/confidence,
  -- premium/discount, cap headroom, and the human-readable reason.
  reasoning TEXT NOT NULL
);

-- Open lots for cost-basis tracking. A buy creates a lot; sells consume FIFO.
CREATE TABLE lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  qty REAL NOT NULL,
  qty_remaining REAL NOT NULL,
  cost_usd REAL NOT NULL,
  trade_id INTEGER NOT NULL REFERENCES trades(id)
);

-- Durable spend ledger backing the guardrail caps. Survives Worker restarts,
-- which an in-memory guardrail cannot.
CREATE TABLE spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  usd REAL NOT NULL,
  kind TEXT NOT NULL DEFAULT 'swap'
);

-- Periodic portfolio valuation for the dashboard equity curve.
CREATE TABLE equity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  cash_usd REAL NOT NULL,
  holdings_usd REAL NOT NULL,
  total_usd REAL NOT NULL,
  -- JSON: [{ "ticker": "AAPL", "qty": 0.1, "value_usd": 32.4 }, ...]
  breakdown TEXT NOT NULL
);

-- Engine cycle log: one row per cron invocation, including skipped cycles,
-- so the dashboard can show why the agent did nothing.
CREATE TABLE cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE INDEX idx_trades_ts ON trades(ts);
CREATE INDEX idx_spend_ts ON spend(ts);
CREATE INDEX idx_equity_ts ON equity_snapshots(ts);
CREATE INDEX idx_lots_ticker ON lots(ticker);
