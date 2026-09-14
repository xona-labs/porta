import { createXPay, rawSolanaSigner, type XPay } from "@xona-labs/xpay";
import type { Decision, Env, PortfolioConfig, StockSignal } from "../types";
import { xstockByTicker } from "../lib/xstocks";
import { fetchLatestSignals } from "../lib/signals";
import { decryptWalletSecret, listActiveUsers, type User } from "../lib/users";
import { fetchUsdcBalance } from "../lib/solana";
import {
  getConfig,
  getHoldings,
  logCycle,
  recordTrade,
  snapshotEquity,
  spentLast24h,
  spentPerTickerLast24h,
} from "../lib/db";

// A 30-minute cron gives 48 cycles per day.
const CYCLES_PER_DAY = 48;
const MIN_TICKET_USD = 0.5;
const ALLOCATION_EPSILON_USD = 0.05;

/**
 * One engine pass over every active portfolio. Signals are fetched once
 * and shared; decisions, caps, and wallets are strictly per user.
 */
export async function runCycle(env: Env): Promise<void> {
  let signals: Map<string, StockSignal>;
  try {
    signals = await fetchLatestSignals(env.SIGNAL_API_BASE);
  } catch (err) {
    await logCycle(env.DB, null, "error", { reason: "signal feed unavailable", error: String(err) });
    return;
  }

  const users = await listActiveUsers(env.DB);
  if (users.length === 0) {
    await logCycle(env.DB, null, "idle", { reason: "no active portfolios" });
    return;
  }

  for (const user of users) {
    try {
      await runUserCycle(env, user, signals);
    } catch (err) {
      await logCycle(env.DB, user.id, "error", { error: String(err) });
    }
  }
}

async function runUserCycle(env: Env, user: User, signals: Map<string, StockSignal>): Promise<void> {
  const cfg = await getConfig(env.DB, user.id);
  if (!cfg || cfg.paused) return;

  const dryRun = env.DRY_RUN !== "false";
  const maxPremiumPct = parseFloat(env.MAX_PREMIUM_PCT) || 1.5;
  const slippageBps = parseInt(env.SLIPPAGE_BPS, 10) || 100;

  const spent = await spentLast24h(env.DB, user.id);
  const tickerSpent = await spentPerTickerLast24h(env.DB, user.id);
  const decisions = decide(cfg, signals, spent, tickerSpent, maxPremiumPct);
  let buys = decisions.filter((d) => d.action === "buy");

  // Pre-trade balance check via public RPC; no key material involved.
  const usdcBalance = dryRun ? null : await fetchUsdcBalance(user.wallet_pubkey, env.SOLANA_RPC_URL);
  if (!dryRun && buys.length > 0 && usdcBalance !== null) {
    let available = usdcBalance - 0.05; // headroom for swap fees and rounding
    const funded: Decision[] = [];
    for (const d of buys) {
      if (d.usd <= available) {
        funded.push(d);
        available -= d.usd;
      } else {
        const idx = decisions.indexOf(d);
        decisions[idx] = {
          ...d,
          action: "skip",
          usd: 0,
          reason: `insufficient USDC in the agent wallet ($${usdcBalance.toFixed(2)} available), deposit to resume`,
        };
      }
    }
    buys = funded;
  }

  const xpay = dryRun || buys.length === 0 ? null : await buildXPayForUser(env, user);

  const executed: unknown[] = [];
  for (const d of buys) {
    const stock = xstockByTicker(d.ticker);
    if (!stock) continue;
    try {
      const result = await executeBuy(env, user.id, xpay, stock.mint, d, dryRun, slippageBps);
      executed.push(result);
    } catch (err) {
      await logCycle(env.DB, user.id, "trade_error", { ticker: d.ticker, error: String(err) });
    }
  }

  // Balance may have changed after the buys; re-read for the snapshot.
  const cash = dryRun
    ? 0
    : buys.length > 0
      ? ((await fetchUsdcBalance(user.wallet_pubkey, env.SOLANA_RPC_URL)) ?? usdcBalance ?? 0)
      : (usdcBalance ?? 0);
  await takeEquitySnapshot(env, user, cash, signals);
  await logCycle(env.DB, user.id, executed.length > 0 ? "traded" : "idle", { decisions, executed });
}

/**
 * Pure decision logic, kept side-effect free so it is unit-testable.
 *
 * Budget pacing: each ticker has a rolling 24h allocation (weight x daily
 * budget). Whenever a ticker is behind its allocation, the agent buys a
 * ticket sized between the minimum and the per-trade cap, but only when the
 * signal is not bearish and the xStock is not trading rich. Small budgets
 * therefore trade less often instead of never.
 */
export function decide(
  cfg: PortfolioConfig,
  signals: Map<string, StockSignal>,
  spentLast24hUsd: number,
  tickerSpent: Map<string, number>,
  maxPremiumPct: number
): Decision[] {
  const decisions: Decision[] = [];
  let plannedSpend = 0;

  for (const entry of cfg.basket) {
    const ticker = entry.ticker.toUpperCase();
    const signal = signals.get(ticker);

    const skip = (reason: string): Decision => ({ ticker, action: "skip", usd: 0, reason, signal });

    const dailyTarget = cfg.daily_budget_usd * entry.weight;
    const spentT = tickerSpent.get(ticker) ?? 0;
    const behind = dailyTarget - spentT;

    // Ticket: the natural per-cycle slice, floored at the minimum trade
    // size and capped by the per-trade limit and the remaining allocation.
    const slice = dailyTarget / CYCLES_PER_DAY;
    const ticket = round2(Math.min(Math.max(slice, MIN_TICKET_USD), cfg.max_per_tx_usd, behind));

    if (behind < MIN_TICKET_USD - ALLOCATION_EPSILON_USD || ticket < MIN_TICKET_USD) {
      decisions.push(
        skip(`on pace: $${spentT.toFixed(2)} of $${dailyTarget.toFixed(2)} daily allocation invested`)
      );
      continue;
    }
    if (!signal) {
      decisions.push(skip("no fresh signal for this ticker"));
      continue;
    }
    if (signal.sentiment === "bearish" || signal.sentiment === "very_bearish") {
      decisions.push(skip(`signal is ${signal.sentiment} (score ${signal.sentiment_score}), pausing buys`));
      continue;
    }
    if (signal.premium_discount_pct !== null && signal.premium_discount_pct > maxPremiumPct) {
      decisions.push(
        skip(
          `xStock trades ${signal.premium_discount_pct.toFixed(2)}% above the underlying, ` +
            `over the ${maxPremiumPct}% guard`
        )
      );
      continue;
    }

    const dayHeadroom = cfg.max_per_day_usd - spentLast24hUsd - plannedSpend;
    if (dayHeadroom < ticket) {
      decisions.push(
        skip(`24h cap reached ($${(spentLast24hUsd + plannedSpend).toFixed(2)} of $${cfg.max_per_day_usd} spent)`)
      );
      continue;
    }

    plannedSpend += ticket;
    const premiumNote =
      signal.premium_discount_pct === null
        ? "premium unknown"
        : `${signal.premium_discount_pct.toFixed(2)}% vs underlying`;
    decisions.push({
      ticker,
      action: "buy",
      usd: ticket,
      reason:
        `$${spentT.toFixed(2)} of $${dailyTarget.toFixed(2)} daily allocation invested; ` +
        `signal ${signal.sentiment} (confidence ${signal.confidence}); ${premiumNote}; ` +
        `$${(dayHeadroom - ticket).toFixed(2)} left under the 24h cap`,
      signal,
    });
  }

  return decisions;
}

async function buildXPayForUser(env: Env, user: User): Promise<XPay> {
  const secretKey = await decryptWalletSecret(env, user);
  return createXPay({
    networks: ["solana"],
    signers: {
      solana: rawSolanaSigner({ secretKey, rpcUrl: env.SOLANA_RPC_URL }),
    },
  });
}

async function executeBuy(
  env: Env,
  userId: string,
  xpay: XPay | null,
  mint: string,
  d: Decision,
  dryRun: boolean,
  slippageBps: number
): Promise<unknown> {
  const refPrice = d.signal?.onchain_price ?? null;

  if (dryRun || !xpay) {
    const qty = refPrice ? d.usd / refPrice : 0;
    await recordTrade(env.DB, userId, {
      ticker: d.ticker,
      side: "buy",
      usd: d.usd,
      qty: round6(qty),
      price_usd: refPrice ?? 0,
      tx_sig: null,
      dry_run: true,
      reasoning: d.reason,
    });
    return { ticker: d.ticker, usd: d.usd, dry_run: true };
  }

  const result = await xpay.swap({ amount: d.usd, from: "USDC", to: mint, slippageBps });
  const qty = Number(result.totalOutAmount);
  await recordTrade(env.DB, userId, {
    ticker: d.ticker,
    side: "buy",
    usd: d.usd,
    qty: round6(qty),
    price_usd: qty > 0 ? round6(d.usd / qty) : refPrice ?? 0,
    tx_sig: result.txSig,
    dry_run: false,
    reasoning: d.reason,
  });
  return { ticker: d.ticker, usd: d.usd, txSig: result.txSig };
}

async function takeEquitySnapshot(
  env: Env,
  user: User,
  cash: number,
  signals: Map<string, StockSignal>
): Promise<void> {
  const holdings = await getHoldings(env.DB, user.id);
  // Marks to the signal feed's on-chain price; falls back to cost basis.
  const breakdown = holdings.map((h) => {
    const price = signals.get(h.ticker)?.onchain_price ?? null;
    return {
      ticker: h.ticker,
      qty: h.qty,
      value_usd: round2(price !== null ? h.qty * price : h.cost_usd),
    };
  });

  await snapshotEquity(env.DB, user.id, round2(cash), breakdown);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
