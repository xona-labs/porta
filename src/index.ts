import { Hono } from "hono";
import type { Env } from "./types";
import { runCycle } from "./engine/cycle";
import { getConfig, getHoldings, saveConfig, spentLast24h } from "./lib/db";
import { XSTOCKS } from "./lib/xstocks";
import { fetchLatestSignals } from "./lib/signals";
import { createUser, getUserByToken, type User } from "./lib/users";

type Vars = { user: User };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// ---------- public ----------

app.get("/api/health", (c) => c.json({ ok: true, service: "porta" }));

app.get("/api/universe", (c) => c.json({ stocks: XSTOCKS }));

app.get("/api/signals", async (c) => {
  try {
    const signals = await fetchLatestSignals(c.env.SIGNAL_API_BASE);
    return c.json({ signals: Object.fromEntries(signals) });
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

/**
 * Onboarding: creates a user with a fresh, isolated agent wallet.
 * Returns the deposit address and the bearer token exactly once.
 */
app.post("/api/users", async (c) => {
  const body = await c.req.json<{ label?: string }>().catch(() => ({} as { label?: string }));
  try {
    const created = await createUser(c.env, body.label);
    return c.json(created, 201);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// Manual cycle trigger for development and demos. Locked behind ADMIN_TOKEN
// when one is configured.
app.post("/api/cycle/run", async (c) => {
  if (c.env.ADMIN_TOKEN && bearerToken(c.req.header("authorization")) !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await runCycle(c.env);
  return c.json({ ok: true });
});

// ---------- authenticated (bearer token from onboarding) ----------

app.use("/api/me/*", async (c, next) => {
  const token = bearerToken(c.req.header("authorization"));
  if (!token) return c.json({ error: "missing bearer token" }, 401);
  const user = await getUserByToken(c.env, token);
  if (!user) return c.json({ error: "invalid token" }, 401);
  c.set("user", user);
  await next();
});

app.get("/api/me", (c) => {
  const { wallet_enc: _omit, ...user } = c.get("user");
  return c.json({ user });
});

app.get("/api/me/config", async (c) => {
  const cfg = await getConfig(c.env.DB, c.get("user").id);
  return c.json({ config: cfg });
});

app.put("/api/me/config", async (c) => {
  const body = await c.req.json<{
    basket: { ticker: string; weight: number }[];
    daily_budget_usd: number;
    max_per_tx_usd: number;
    max_per_day_usd: number;
    paused?: boolean;
  }>();

  const weightSum = body.basket.reduce((s, b) => s + b.weight, 0);
  if (Math.abs(weightSum - 1) > 0.001) {
    return c.json({ error: "basket weights must sum to 1" }, 400);
  }
  // The daily cap may sit below the budget; the cap always wins.
  const unknown = body.basket.find((b) => !XSTOCKS.some((s) => s.ticker === b.ticker.toUpperCase()));
  if (unknown) {
    return c.json({ error: `unknown ticker ${unknown.ticker}` }, 400);
  }

  await saveConfig(c.env.DB, c.get("user").id, {
    basket: body.basket,
    daily_budget_usd: body.daily_budget_usd,
    max_per_tx_usd: body.max_per_tx_usd,
    max_per_day_usd: body.max_per_day_usd,
    paused: body.paused ?? false,
  });
  return c.json({ ok: true });
});

app.get("/api/me/portfolio", async (c) => {
  const userId = c.get("user").id;
  const [holdings, spent, cfg] = await Promise.all([
    getHoldings(c.env.DB, userId),
    spentLast24h(c.env.DB, userId),
    getConfig(c.env.DB, userId),
  ]);
  return c.json({
    deposit_address: c.get("user").wallet_pubkey,
    holdings,
    spent_last_24h_usd: spent,
    caps: cfg
      ? { max_per_tx_usd: cfg.max_per_tx_usd, max_per_day_usd: cfg.max_per_day_usd }
      : null,
  });
});

app.get("/api/me/trades", async (c) => {
  const limit = clampLimit(c.req.query("limit"));
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM trades WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2"
  )
    .bind(c.get("user").id, limit)
    .all();
  return c.json({ trades: results });
});

app.get("/api/me/cycles", async (c) => {
  const limit = clampLimit(c.req.query("limit"));
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM cycles WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2"
  )
    .bind(c.get("user").id, limit)
    .all();
  return c.json({ cycles: results });
});

app.get("/api/me/equity", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM equity_snapshots WHERE user_id = ?1 ORDER BY id DESC LIMIT 336"
  )
    .bind(c.get("user").id)
    .all();
  return c.json({ snapshots: (results ?? []).reverse() });
});

// ---------- helpers ----------

function bearerToken(header: string | undefined): string | null {
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

function clampLimit(raw: string | undefined): number {
  return Math.min(parseInt(raw ?? "50", 10) || 50, 200);
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCycle(env));
  },
} satisfies ExportedHandler<Env>;
