-- Porta core schema. Multi-tenant: every portfolio belongs to a user, and
-- every user gets an isolated agent wallet generated at onboarding.
-- Money amounts are USD as REAL; token quantities are REAL in human units.

-- A user and their agent wallet. The wallet secret is stored AES-256-GCM
-- encrypted under the MASTER_KEY Worker secret; only the cron engine
-- decrypts it, and only to sign swaps within the user's caps.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  label TEXT,
  wallet_pubkey TEXT NOT NULL,
  wallet_enc TEXT NOT NULL,
  -- SHA-256 of the user's bearer token. The token itself is shown once.
  token_hash TEXT NOT NULL UNIQUE
);

-- Portfolio configuration, one row per user.
CREATE TABLE config (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
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
  user_id TEXT NOT NULL REFERENCES users(id),
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
  user_id TEXT NOT NULL REFERENCES users(id),
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
  user_id TEXT NOT NULL REFERENCES users(id),
  ts TEXT NOT NULL,
  usd REAL NOT NULL,
  kind TEXT NOT NULL DEFAULT 'swap'
);

-- Periodic portfolio valuation for the dashboard equity curve.
CREATE TABLE equity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  ts TEXT NOT NULL,
  cash_usd REAL NOT NULL,
  holdings_usd REAL NOT NULL,
  total_usd REAL NOT NULL,
  -- JSON: [{ "ticker": "AAPL", "qty": 0.1, "value_usd": 32.4 }, ...]
  breakdown TEXT NOT NULL
);

-- Engine cycle log: one row per user per cron pass, including skipped
-- cycles, so the dashboard can show why the agent did nothing.
CREATE TABLE cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  ts TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE INDEX idx_trades_user_ts ON trades(user_id, ts);
CREATE INDEX idx_spend_user_ts ON spend(user_id, ts);
CREATE INDEX idx_equity_user_ts ON equity_snapshots(user_id, ts);
CREATE INDEX idx_lots_user_ticker ON lots(user_id, ticker);
CREATE INDEX idx_cycles_user ON cycles(user_id, ts);
