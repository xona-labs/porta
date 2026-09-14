import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  demoApi,
  clearToken,
  type Cycle,
  type EquitySnapshot,
  type Portfolio,
  type PortfolioConfig,
  type Signal,
  type Trade,
} from "../api";
import { pct, qty, shortAddress, shortSig, timeAgo, usd } from "../format";
import { Brand, Button, Card, CopyButton, EmptyNote, SectionLabel, Skeleton, Stat } from "../ui";

const REFRESH_MS = 60_000;

export function Dashboard({
  token,
  onSignOut,
  demo = false,
}: {
  token: string;
  onSignOut: () => void;
  demo?: boolean;
}) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [config, setConfig] = useState<PortfolioConfig | null>(null);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [equity, setEquity] = useState<EquitySnapshot[] | null>(null);
  const [signals, setSignals] = useState<Record<string, Signal>>({});
  const [pausing, setPausing] = useState(false);

  const refresh = useCallback(() => {
    const src = demo
      ? demoApi
      : {
          portfolio: () => api.portfolio(token),
          config: () => api.config(token),
          trades: () => api.trades(token),
          cycles: () => api.cycles(token),
          equity: () => api.equity(token),
        };
    src.portfolio().then(setPortfolio).catch(() => {});
    src.config().then((r) => setConfig(r.config)).catch(() => {});
    src.trades().then((r) => setTrades(r.trades)).catch(() => {});
    src.cycles().then((r) => setCycles(r.cycles)).catch(() => {});
    src.equity().then((r) => setEquity(r.snapshots)).catch(() => {});
    api.signals().then((r) => setSignals(r.signals)).catch(() => {});
  }, [token, demo]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const holdings = useMemo(() => {
    return (portfolio?.holdings ?? []).map((h) => {
      const price = signals[h.ticker]?.onchain_price ?? null;
      const value = price !== null ? h.qty * price : h.cost_usd;
      const pnl = value - h.cost_usd;
      const pnlPct = h.cost_usd > 0 ? (pnl / h.cost_usd) * 100 : 0;
      return { ...h, price, value, pnl, pnlPct, premium: signals[h.ticker]?.premium_discount_pct ?? null };
    });
  }, [portfolio, signals]);

  const holdingsValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalCost = holdings.reduce((s, h) => s + h.cost_usd, 0);
  const totalPnl = holdingsValue - totalCost;
  const cash = portfolio?.cash_usd ?? 0;
  const spent = portfolio?.spent_last_24h_usd ?? 0;
  const dayCap = portfolio?.caps?.max_per_day_usd ?? 0;
  const capUsedPct = dayCap > 0 ? Math.min((spent / dayCap) * 100, 100) : 0;

  const togglePause = async () => {
    if (!config) return;
    setPausing(true);
    try {
      await api.saveConfig(token, { ...config, paused: !config.paused });
      setConfig({ ...config, paused: !config.paused });
    } finally {
      setPausing(false);
    }
  };

  const signOut = () => {
    clearToken();
    onSignOut();
  };

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Brand />
          {demo ? (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Live demo portfolio, real trades on Solana mainnet
            </p>
          ) : config?.paused ? (
            <p className="mt-1 text-xs font-medium text-amber-600">Investing paused</p>
          ) : (
            <p className="mt-1 text-xs text-stone-500">Investing every 30 minutes</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {portfolio ? (
            <a
              href={`https://solscan.io/account/${portfolio.deposit_address}`}
              target="_blank"
              rel="noreferrer"
              className="num rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 hover:border-stone-400"
            >
              {shortAddress(portfolio.deposit_address)}
            </a>
          ) : null}
          {demo ? (
            <a href="/">
              <Button>Create your own</Button>
            </a>
          ) : (
            <>
              {portfolio ? (
                <CopyButton text={portfolio.deposit_address} label="Copy address" />
              ) : null}
              <Button variant="ghost" onClick={togglePause} disabled={pausing || !config}>
                {config?.paused ? "Resume" : "Pause"}
              </Button>
              <Button variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Portfolio value" value={usd(holdingsValue + cash)} />
        <Stat
          label="Holdings"
          value={usd(holdingsValue)}
          tone={totalPnl > 0.005 ? "up" : totalPnl < -0.005 ? "down" : "neutral"}
          sub={<span className="num">{usd(totalPnl)} ({pct(totalCost > 0 ? (totalPnl / totalCost) * 100 : 0)})</span>}
        />
        <Stat label="Cash (USDC)" value={usd(cash)} sub="Deposit USDC to invest more" />
        <Card className="p-4">
          <p className="text-xs text-stone-500">Spent last 24h</p>
          <p className="num mt-1 text-xl font-semibold text-stone-900">
            {usd(spent)} <span className="text-sm font-normal text-stone-500">of {usd(dayCap)}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div
              className={`h-full rounded-full transition-all ${
                capUsedPct >= 100 ? "bg-red-500" : capUsedPct >= 80 ? "bg-amber-500" : "bg-emerald-600"
              }`}
              style={{ width: `${capUsedPct}%` }}
            />
          </div>
        </Card>
      </div>

      <section className="mb-8">
        <SectionLabel>Portfolio value over time</SectionLabel>
        {equity === null ? (
          <Skeleton className="h-48" />
        ) : equity.length < 2 ? (
          <EmptyNote>The value chart appears after a few investing cycles.</EmptyNote>
        ) : (
          <Card className="p-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equity} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="ts"
                    tickFormatter={(ts: string) =>
                      new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }
                    tick={{ fontSize: 11, fill: "#78716c" }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={48}
                  />
                  <YAxis
                    tickFormatter={(v: number) => usd(v, 0)}
                    tick={{ fontSize: 11, fill: "#78716c" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    formatter={(v) => [usd(Number(v)), "Total"]}
                    labelFormatter={(ts) => new Date(String(ts)).toLocaleString()}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total_usd"
                    stroke="#059669"
                    strokeWidth={1.5}
                    fill="url(#equityFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </section>

      <section className="mb-8">
        <SectionLabel>Holdings</SectionLabel>
        {portfolio === null ? (
          <Skeleton className="h-32" />
        ) : holdings.length === 0 ? (
          <EmptyNote>
            No holdings yet. Fund the agent wallet with USDC and the next cycle starts buying.
          </EmptyNote>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="px-4 py-2.5 font-medium">Stock</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  <th className="px-4 py-2.5 text-right font-medium">PnL</th>
                  <th className="px-4 py-2.5 text-right font-medium">vs underlying</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {holdings.map((h) => (
                  <tr key={h.ticker}>
                    <td className="px-4 py-2.5 font-medium">{h.ticker}</td>
                    <td className="num px-4 py-2.5 text-right">{qty(h.qty)}</td>
                    <td className="num px-4 py-2.5 text-right text-stone-500">{usd(h.cost_usd)}</td>
                    <td className="num px-4 py-2.5 text-right">{usd(h.value)}</td>
                    <td
                      className={`num px-4 py-2.5 text-right ${
                        h.pnl > 0.005 ? "text-emerald-600" : h.pnl < -0.005 ? "text-red-500" : "text-stone-500"
                      }`}
                    >
                      {pct(h.pnlPct)}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-stone-500">
                      {h.premium === null ? "-" : pct(h.premium)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionLabel>Trades, each with its reasoning</SectionLabel>
          {trades === null ? (
            <Skeleton className="h-40" />
          ) : trades.length === 0 ? (
            <EmptyNote>No trades yet.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-2">
              {trades.map((t) => (
                <Card key={t.id} className="p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">
                      {t.side === "buy" ? "Bought" : "Sold"} {t.ticker}
                      {t.dry_run ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          simulated
                        </span>
                      ) : null}
                    </p>
                    <p className="num text-sm">{usd(t.usd)}</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-stone-500">{t.reasoning}</p>
                  <div className="num mt-1.5 flex items-center gap-3 text-[11px] text-stone-400">
                    <span>{timeAgo(t.ts)}</span>
                    <span>
                      {qty(t.qty)} at {usd(t.price_usd)}
                    </span>
                    {t.tx_sig ? (
                      <a
                        href={`https://solscan.io/tx/${t.tx_sig}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:underline"
                      >
                        {shortSig(t.tx_sig)}
                      </a>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-2">
          <SectionLabel>Agent activity</SectionLabel>
          {cycles === null ? (
            <Skeleton className="h-40" />
          ) : cycles.length === 0 ? (
            <EmptyNote>The agent reports here every cycle.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-2">
              {dedupeCycles(cycles).map(({ cycle, count }) => (
                <ActivityRow key={cycle.id} cycle={cycle} count={count} />
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-12 flex items-center justify-between border-t border-stone-200 pt-6 text-xs text-stone-400">
        <span>Porta by Xona. Tokenized stocks on Solana.</span>
        <a
          href="https://github.com/xona-labs/porta"
          target="_blank"
          rel="noreferrer"
          className="hover:text-stone-600"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}

interface CycleDetail {
  decisions?: { ticker: string; action: string; reason: string }[];
  reason?: string;
  error?: string;
}

/** Collapses runs of same-status error rows so retries read as one line. */
function dedupeCycles(cycles: Cycle[]): { cycle: Cycle; count: number }[] {
  const out: { cycle: Cycle; count: number }[] = [];
  for (const c of cycles) {
    const prev = out[out.length - 1];
    const collapsible = c.status === "trade_error" || c.status === "error";
    if (prev && collapsible && prev.cycle.status === c.status) prev.count += 1;
    else out.push({ cycle: c, count: 1 });
  }
  return out;
}

function ActivityRow({ cycle, count = 1 }: { cycle: Cycle; count?: number }) {
  const detail = useMemo<CycleDetail>(() => {
    try {
      return JSON.parse(cycle.detail) as CycleDetail;
    } catch {
      return {};
    }
  }, [cycle.detail]);

  const skips = (detail.decisions ?? []).filter((d) => d.action === "skip");
  const buys = (detail.decisions ?? []).filter((d) => d.action === "buy");

  const summary =
    cycle.status === "traded"
      ? `Bought ${buys.map((b) => b.ticker).join(", ")}`
      : cycle.status === "idle"
        ? skips.length > 0
          ? "Held back this cycle"
          : detail.reason ?? "Nothing to do"
        : cycle.status === "trade_error"
          ? "A buy did not go through, retrying next cycle"
          : cycle.status === "error"
            ? "Cycle hit an error, retrying next cycle"
            : cycle.status;

  return (
    <Card className="p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {summary}
          {count > 1 ? <span className="ml-1.5 text-xs text-stone-400">x{count}</span> : null}
        </p>
        <p className="num shrink-0 text-[11px] text-stone-400">{timeAgo(cycle.ts)}</p>
      </div>
      {skips.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {skips.map((s, i) => (
            <li key={i} className="text-xs leading-relaxed text-stone-500">
              <span className="font-medium text-stone-600">{s.ticker}</span>: {s.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {detail.error ? (
        <p className="mt-1 truncate text-xs text-stone-400" title={detail.error}>
          {detail.error.replace(/^Error:\s*/, "")}
        </p>
      ) : null}
    </Card>
  );
}
