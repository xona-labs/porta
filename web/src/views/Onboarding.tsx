import { useEffect, useState } from "react";
import { api, type XStock } from "../api";
import { Button, Card, CopyButton, Field, inputClass } from "../ui";

export function Welcome({ onLogin, error }: { onLogin: () => void; error?: string | null }) {
  return (
    <Shell>
      <p className="text-sm font-semibold tracking-tight text-stone-900">Porta</p>
      <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight">
        Your portfolio, on autopilot.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600">
        An agent invests into tokenized stocks on Solana around the clock, inside hard spending
        caps you set, and writes down the reasoning behind every trade.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Button onClick={onLogin}>Continue with email</Button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-stone-500">
        Signing in creates a dedicated agent wallet for you. You fund it with only what you want
        automated; your own wallet is never touched.
      </p>
      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
    </Shell>
  );
}

const DEFAULT_TICKERS = ["AAPL", "NVDA", "SPY"];
const PRESETS = [5, 10, 25, 50];

/** Derived caps: a single buy is small relative to the budget, and the 24h hard stop equals the budget. */
function derivedCaps(budget: number): { perTx: number; perDay: number } {
  return {
    perTx: Math.max(1, Math.round(budget / 10)),
    perDay: budget,
  };
}

export function Setup({ token, onDone }: { token: string; onDone: () => void }) {
  const [universe, setUniverse] = useState<XStock[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_TICKERS));
  const [budget, setBudget] = useState(10);
  const [customBudget, setCustomBudget] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [perTx, setPerTx] = useState<string | null>(null);
  const [perDay, setPerDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);

  useEffect(() => {
    api.universe().then((r) => setUniverse(r.stocks)).catch(() => {});
    api.me(token).then((r) => setDepositAddress(r.user.wallet_pubkey)).catch(() => {});
  }, [token]);

  const toggle = (ticker: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const effectiveBudget = customBudget !== "" ? parseFloat(customBudget) || 0 : budget;
  const caps = derivedCaps(effectiveBudget);
  const effectivePerTx = perTx !== null ? parseFloat(perTx) || 0 : caps.perTx;
  const effectivePerDay = perDay !== null ? parseFloat(perDay) || 0 : caps.perDay;

  const save = async () => {
    if (selected.size === 0) {
      setError("Pick at least one stock.");
      return;
    }
    if (effectiveBudget < 1) {
      setError("The daily amount must be at least $1.");
      return;
    }
    setBusy(true);
    setError(null);
    const weight = 1 / selected.size;
    try {
      await api.saveConfig(token, {
        basket: [...selected].map((ticker) => ({ ticker, weight })),
        daily_budget_usd: effectiveBudget,
        max_per_tx_usd: effectivePerTx,
        max_per_day_usd: effectivePerDay,
        paused: false,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const weightPct = selected.size > 0 ? (100 / selected.size).toFixed(0) : "0";

  return (
    <Shell wide>
      <h1 className="text-2xl font-semibold tracking-tight">Set up your plan</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-stone-600">
        Your agent invests a daily amount into the stocks you pick, spread across the day in
        small buys. It skips overpriced entries and explains every decision.
      </p>

      <div className="mt-8">
        <p className="text-sm font-medium text-stone-800">1. Pick your stocks</p>
        <p className="mt-0.5 text-xs text-stone-500">Split equally across your picks.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {universe.map((s) => {
            const active = selected.has(s.ticker);
            return (
              <button
                key={s.ticker}
                onClick={() => toggle(s.ticker)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "border-emerald-600 bg-emerald-50"
                    : "border-stone-200 bg-white hover:border-stone-400"
                }`}
              >
                <p className="text-sm font-medium text-stone-900">{s.ticker}</p>
                <p className="truncate text-xs text-stone-500">{s.name}</p>
                {active ? <p className="num mt-1 text-xs text-emerald-700">{weightPct}%</p> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        <p className="text-sm font-medium text-stone-800">2. Choose a daily amount</p>
        <p className="mt-0.5 text-xs text-stone-500">
          How much the agent invests per day, total across all stocks.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => {
            const active = customBudget === "" && budget === p;
            return (
              <button
                key={p}
                onClick={() => {
                  setBudget(p);
                  setCustomBudget("");
                }}
                className={`num rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-400"
                }`}
              >
                ${p}/day
              </button>
            );
          })}
          <input
            className={`${inputClass} num w-28`}
            value={customBudget}
            onChange={(e) => setCustomBudget(e.target.value)}
            placeholder="Custom"
            inputMode="decimal"
          />
        </div>
        <button
          className="mt-3 text-xs text-stone-500 underline-offset-2 hover:underline"
          onClick={() => setAdvanced(!advanced)}
        >
          {advanced ? "Hide safety limits" : "Safety limits"}
        </button>
        {advanced ? (
          <div className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
            <Field label="Max per single buy" helper="Hard cap on any one trade">
              <input
                className={`${inputClass} num`}
                value={perTx ?? String(caps.perTx)}
                onChange={(e) => setPerTx(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Max per 24 hours" helper="Hard stop, wins over the daily amount">
              <input
                className={`${inputClass} num`}
                value={perDay ?? String(caps.perDay)}
                onChange={(e) => setPerDay(e.target.value)}
                inputMode="decimal"
              />
            </Field>
          </div>
        ) : (
          <p className="mt-1 text-xs text-stone-400">
            Auto: max {`$${caps.perTx}`} per buy, {`$${caps.perDay}`} per 24h. Enforced before
            any trade is signed.
          </p>
        )}
      </div>

      <div className="mt-8">
        <p className="text-sm font-medium text-stone-800">3. Fund your agent</p>
        <p className="mt-0.5 text-xs text-stone-500">
          Send USDC on Solana to your agent's wallet, only what you want automated. You can also
          do this later from the dashboard.
        </p>
        {depositAddress ? (
          <Card className="mt-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <code className="num break-all text-xs text-stone-800">{depositAddress}</code>
              <CopyButton text={depositAddress} />
            </div>
          </Card>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
      <Button className="mt-8" onClick={save} disabled={busy}>
        {busy ? "Saving..." : "Start investing"}
      </Button>
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto min-h-[100dvh] w-full px-4 py-16 ${wide ? "max-w-2xl" : "max-w-md"}`}>
      {children}
    </div>
  );
}
