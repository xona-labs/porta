import { useEffect, useState } from "react";

interface Holding {
  ticker: string;
  qty: number;
  cost_usd: number;
}

interface Trade {
  id: number;
  ts: string;
  ticker: string;
  side: string;
  usd: number;
  qty: number;
  price_usd: number;
  tx_sig: string | null;
  dry_run: number;
  reasoning: string;
}

function useAuthedJson<T>(url: string, token: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch(url, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d as T))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url, token]);
  return data;
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem("porta_token");
  } catch {
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [input, setInput] = useState("");

  const portfolio = useAuthedJson<{
    deposit_address: string;
    holdings: Holding[];
    spent_last_24h_usd: number;
  }>("/api/me/portfolio", token);
  const trades = useAuthedJson<{ trades: Trade[] }>("/api/me/trades?limit=20", token);

  const saveToken = () => {
    const t = input.trim();
    if (!t) return;
    try {
      localStorage.setItem("porta_token", t);
    } catch {}
    setToken(t);
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <h1 className="text-2xl font-semibold tracking-tight">Porta</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Your portfolio, on autopilot. Capped, explained, on Solana.
        </p>
        <label className="mb-1 block text-sm font-medium">Access token</label>
        <input
          className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste the token from onboarding"
        />
        <button
          onClick={saveToken}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Open portfolio
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Porta</h1>
        <p className="text-sm text-neutral-500">
          Your portfolio, on autopilot. Capped, explained, on Solana.
        </p>
        {portfolio?.deposit_address ? (
          <p className="mt-2 text-xs text-neutral-400">
            Agent wallet: <span className="font-mono">{portfolio.deposit_address}</span>
          </p>
        ) : null}
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Holdings
        </h2>
        {portfolio?.holdings?.length ? (
          <table className="w-full text-sm">
            <tbody>
              {portfolio.holdings.map((h) => (
                <tr key={h.ticker} className="border-b border-neutral-200">
                  <td className="py-2 font-medium">{h.ticker}</td>
                  <td className="py-2 text-right tabular-nums">{h.qty.toFixed(6)}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">
                    ${h.cost_usd.toFixed(2)} cost
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-400">No holdings yet. The agent buys on its next cycle.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Recent trades
        </h2>
        <ul className="space-y-3">
          {(trades?.trades ?? []).map((t) => (
            <li key={t.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">
                  {t.side.toUpperCase()} {t.ticker}
                  {t.dry_run ? <span className="ml-2 text-xs text-amber-600">simulated</span> : null}
                </span>
                <span className="tabular-nums text-sm">${t.usd.toFixed(2)}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{t.reasoning}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
