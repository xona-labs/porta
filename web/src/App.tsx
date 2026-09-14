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

function useJson<T>(url: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => r.json())
      .then((d) => alive && setData(d as T))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return data;
}

export default function App() {
  const portfolio = useJson<{ holdings: Holding[]; spent_last_24h_usd: number }>("/api/portfolio");
  const trades = useJson<{ trades: Trade[] }>("/api/trades?limit=20");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Porta</h1>
        <p className="text-sm text-neutral-500">
          Your portfolio, on autopilot. Capped, explained, on Solana.
        </p>
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
