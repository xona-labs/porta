# Porta, hackathon submission draft

## One-liner

Porta is an AI robo-advisor for tokenized stocks: pick stocks and a daily amount, and an agent invests for you 24/7 on Solana, inside hard spending caps, with every trade explained.

## Description

Brokerage apps still ask you to babysit them. Porta asks you two questions, which stocks and how much per day, and then an AI agent does the investing.

Sign in with your email and Porta creates a dedicated agent wallet for you. Fund it with USDC, only what you want automated, and the agent takes over: every 30 minutes it reads a live signal feed, checks each xStock's premium against the price of the real underlying stock, and dollar-cost-averages into your basket with small paced buys via Jupiter. It refuses to buy when a tokenized stock trades rich versus the real market, pauses on bearish signals, and stops when the wallet needs a deposit.

The trust model is the product. Per-trade and 24-hour spending caps are enforced in a durable ledger before any transaction is signed, so the agent physically cannot overspend. Wallet secrets are encrypted at rest and decrypted only inside the trade cycle. And every action is explained: each buy records the signal, the premium reading, and the cap headroom that justified it, and every skipped cycle records why. The dashboard reads like an advisor's notes, not a black box.

It runs in production today, trading real USDC into real xStocks on mainnet. The public demo portfolio shows live trades anyone can verify on Solscan.

## Why Solana

Porta cannot exist at a traditional brokerage, and it cannot exist on another chain:

- Tokenized stocks (Backed's xStocks) already trade on Solana with real liquidity on Jupiter. Markets never close, so a robo-advisor can actually invest around the clock instead of queueing orders for 9:30am.
- Programmable custody is what makes an AI agent safe to trust. On Solana, Porta gives each user an isolated agent wallet with hard, code-enforced spending caps. A brokerage cannot offer "an advisor that physically cannot exceed $5/day."
- Sub-cent fees make micro-DCA viable. Porta buys in $0.50 tickets; at equity-brokerage or L1-ethereum costs this strategy would be eaten by fees.
- The premium/discount between an xStock and its underlying is readable on-chain in real time, which is what powers Porta's best-execution guard.

## What is live

- App: https://porta.xona-agent.com (email login, real onboarding)
- Live demo portfolio, no login needed: https://porta.xona-agent.com/demo
- GitHub: https://github.com/xona-labs/porta
- Real mainnet trade, example: https://solscan.io/tx/2KNNHqBwnsjmANgL3sZx6jbbncaegsWCKyeisdSWVrZLk19SEkfTsFQiGqMd8dG2Z1TzvC2e8VxjMZvG5tHQqogC

## How it's built

Cloudflare Workers (cron engine + Hono API) and D1 (users, sessions, trade ledger with cost-basis lots, durable spend caps, equity history). Privy for email login, verified server-side. Swap execution through the open-source @xona-labs/xpay SDK (Jupiter). Signal feed with per-xStock premium/discount from the Xona API. React dashboard served as Worker assets.

## Wedge

Investing. One wedge, made excellent: recurring buys that are safer (caps), smarter (premium guard), and more honest (explained trades) than a brokerage app's DCA.
