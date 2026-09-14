import { Hono } from "hono";
import type { Env } from "./types";
import { runCycle } from "./engine/cycle";
import { getConfig, getHoldings, saveConfig, spentLast24h } from "./lib/db";
import { XSTOCKS } from "./lib/xstocks";
import { fetchLatestSignals } from "./lib/signals";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, service: "porta" }));

app.get("/api/universe", (c) => c.json({ stocks: XSTOCKS }));

app.get("/api/config", async (c) => {
  const cfg = await getConfig(c.env.DB);
  return c.json({ config: cfg });
});

app.put("/api/config", async (c) => {
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
  if (body.daily_budget_usd > body.max_per_day_usd) {
    return c.json({ error: "daily budget cannot exceed the daily cap" }, 400);
  }

  await saveConfig(c.env.DB, {
    basket: body.basket,
    daily_budget_usd: body.daily_budget_usd,
    max_per_tx_usd: body.max_per_tx_usd,
    max_per_day_usd: body.max_per_day_usd,
    paused: body.paused ?? false,
  });
  return c.json({ ok: true });
});

app.get("/api/portfolio", async (c) => {
  const [holdings, spent, cfg] = await Promise.all([
    getHoldings(c.env.DB),
    spentLast24h(c.env.DB),
    getConfig(c.env.DB),
  ]);
  return c.json({
    holdings,
    spent_last_24h_usd: spent,
    caps: cfg
      ? { max_per_tx_usd: cfg.max_per_tx_usd, max_per_day_usd: cfg.max_per_day_usd }
      : null,
  });
});

app.get("/api/trades", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM trades ORDER BY id DESC LIMIT ?1"
  )
    .bind(limit)
    .all();
  return c.json({ trades: results });
});

app.get("/api/cycles", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM cycles ORDER BY id DESC LIMIT ?1"
  )
    .bind(limit)
    .all();
  return c.json({ cycles: results });
});

app.get("/api/equity", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM equity_snapshots ORDER BY id DESC LIMIT 336"
  ).all();
  return c.json({ snapshots: (results ?? []).reverse() });
});

app.get("/api/signals", async (c) => {
  try {
    const signals = await fetchLatestSignals(c.env.SIGNAL_API_BASE);
    return c.json({ signals: Object.fromEntries(signals) });
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

// Manual cycle trigger for local development and demos.
app.post("/api/cycle/run", async (c) => {
  await runCycle(c.env);
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCycle(env));
  },
} satisfies ExportedHandler<Env>;
