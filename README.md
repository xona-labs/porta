# Porta

**Your portfolio, on autopilot. Capped, explained, on Solana.**

Porta is a non-custodial AI portfolio manager for tokenized stocks (xStocks). You set a basket, a daily budget, and hard spending caps. An agent does the rest: it dollar-cost-averages into your basket around the clock, checks every buy against a live market-quality guard, and writes down the reasoning behind every trade so you can audit it.

Built by [Xona Labs](https://github.com/xona-labs) for the Solana tokenized stocks hackathon.

## Why this beats a brokerage app

- **24/7 investing.** xStocks trade around the clock on Solana. Porta's engine runs every 30 minutes, weekends included.
- **Hard caps, not promises.** Per-transaction and rolling 24-hour spending caps are enforced in a durable ledger before any transaction is signed. The agent physically cannot overspend.
- **The premium guard.** Tokenized stocks can trade above or below the price of the underlying. Porta reads the live premium/discount for every xStock and refuses to buy when the token trades rich, so your DCA never overpays for wrapped exposure.
- **Every trade explained.** Each buy records the signal sentiment, the premium reading, and the remaining cap headroom that justified it. The trade log reads like an advisor's notes, not a black box.
- **An isolated agent wallet per user.** Onboarding generates a fresh wallet just for your agent. You fund it from your own wallet with only what you are willing to automate; your main wallet is never touched. Wallet secrets are AES-256-GCM encrypted at rest and decrypted only inside the trade cycle. Delegated signing against the user's own wallet (Privy) is the production path on the roadmap.

## How it works

```
Cloudflare cron (30 min)
        v
  fetch signals ──────── Xona signal feed (sentiment, confidence,
        v                premium/discount per xStock)
  decide per basket entry
        - skip if bearish
        - skip if premium > guard threshold
        - clamp to per-tx cap
        - skip if 24h cap reached (durable D1 ledger)
        v
  swap USDC -> xStock ── @xona-labs/xpay (Jupiter execution)
        v
  record trade + lot + reasoning, snapshot equity (D1)
        v
  dashboard reads it all back
```

## Stack

- **Cloudflare Workers** for the engine (cron triggers) and API (Hono)
- **Cloudflare D1** for the trade ledger, cost-basis lots, spend caps, and equity history
- **[@xona-labs/xpay](https://www.npmjs.com/package/@xona-labs/xpay)** for wallet, signing, and Jupiter swap execution
- **Xona signal feed** for stock sentiment and xStock premium/discount
- **React + Vite + Tailwind** dashboard served as Worker assets

## Running it

```sh
npm install
npm --prefix web install

# create the database, then paste its id into wrangler.jsonc
npx wrangler d1 create porta
npm run db:migrate:local

npm run dev            # worker on :8787
npm run web:dev        # dashboard on :5173, proxies /api
```

Set the local secrets (copy `.dev.vars.example` to `.dev.vars`):

```sh
openssl rand -base64 32   # use as MASTER_KEY
```

Trades are **simulated by default** (`DRY_RUN=true`). To trade for real, set `DRY_RUN` to `"false"` in `wrangler.jsonc`, put the secrets, and deploy:

```sh
npx wrangler secret put MASTER_KEY
npx wrangler secret put SOLANA_RPC_URL   # optional
npm run db:migrate
npm run deploy
```

### Onboarding a user

```sh
# 1. Create a user. Save the token; it is shown exactly once.
curl -X POST http://localhost:8787/api/users -H 'content-type: application/json' \
  -d '{ "label": "ibam" }'
# -> { "user_id": "...", "token": "...", "deposit_address": "..." }

# 2. Fund the deposit address with USDC on Solana (only what you want automated).

# 3. Configure the portfolio.
curl -X PUT http://localhost:8787/api/me/config \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "basket": [
    { "ticker": "AAPL", "weight": 0.3 },
    { "ticker": "NVDA", "weight": 0.3 },
    { "ticker": "SPY",  "weight": 0.4 }
  ],
  "daily_budget_usd": 24,
  "max_per_tx_usd": 2,
  "max_per_day_usd": 30
}'
```

The agent starts buying on the next cycle. `GET /api/me/trades` shows every trade with its reasoning; the dashboard reads the same API with the token.

## Safety model

1. **Dry run by default.** Nothing is signed until a MASTER_KEY is set and dry run is disabled.
2. **Isolated wallets.** Each user's agent trades only from its own capped allowance wallet; exposure is bounded by what you deposit and the caps you set.
3. **Wallet secrets are encrypted at rest** (AES-256-GCM under a Worker secret) and decrypted only inside the trade cycle. Bearer tokens are stored as SHA-256 hashes.
4. **Caps live in D1**, not in process memory, so restarts and redeploys never reset the daily limit.
5. **The premium guard is checked per buy** using the live on-chain price versus the underlying.
6. **Bearish signals pause buying** for that ticker; the skip and its reason are logged like any trade.

## License

MIT
