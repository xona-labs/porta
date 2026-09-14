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

export function Setup({ token, onDone }: { token: string; onDone: () => void }) {
  const [universe, setUniverse] = useState<XStock[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_TICKERS));
  const [budget, setBudget] = useState("48");
  const [perTx, setPerTx] = useState("2");
  const [perDay, setPerDay] = useState("10");
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

  const save = async () => {
    if (selected.size === 0) {
      setError("Pick at least one stock.");
      return;
    }
    setBusy(true);
    setError(null);
    const weight = 1 / selected.size;
    try {
      await api.saveConfig(token, {
        basket: [...selected].map((ticker) => ({ ticker, weight })),
        daily_budget_usd: parseFloat(budget) || 0,
        max_per_tx_usd: parseFloat(perTx) || 0,
        max_per_day_usd: parseFloat(perDay) || 0,
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
      <h1 className="text-2xl font-semibold tracking-tight">Set up your portfolio</h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        Pick the stocks to hold, equally weighted. The agent buys small slices around the clock
        and never exceeds the caps below.
      </p>

      {depositAddress ? (
        <Card className="mt-6 p-4">
          <p className="text-xs text-stone-500">
            Your agent wallet. Send USDC on Solana here to give the agent funds to invest.
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <code className="num break-all text-xs text-stone-800">{depositAddress}</code>
            <CopyButton text={depositAddress} />
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
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

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Field label="Daily budget" helper="Target USDC invested per day">
          <input className={`${inputClass} num`} value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Max per trade" helper="Hard cap on a single buy">
          <input className={`${inputClass} num`} value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Max per 24h" helper="Hard cap, always wins over the budget">
          <input className={`${inputClass} num`} value={perDay} onChange={(e) => setPerDay(e.target.value)} inputMode="decimal" />
        </Field>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
      <Button className="mt-6" onClick={save} disabled={busy}>
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
