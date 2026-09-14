import { useState, type ReactNode, type ButtonHTMLAttributes } from "react";

/*
 * Shape system: cards 16px (rounded-2xl), controls 8px (rounded-lg).
 * One accent: emerald. Red appears only as semantic negative PnL.
 */

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const base =
    "rounded-lg px-4 py-2 text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none";
  const styles =
    variant === "primary"
      ? "bg-stone-900 text-stone-50 hover:bg-stone-700"
      : "border border-stone-300 text-stone-700 hover:bg-stone-100";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stone-200 bg-white ${className}`}>{children}</div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-medium text-stone-500">{children}</h2>;
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "neutral" | "up" | "down";
}) {
  const valueColor =
    tone === "up" ? "text-emerald-600" : tone === "down" ? "text-red-500" : "text-stone-900";
  return (
    <Card className="p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`num mt-1 text-xl font-semibold ${valueColor}`}>{value}</p>
      {sub ? <div className="mt-1 text-xs text-stone-500">{sub}</div> : null}
    </Card>
  );
}

export function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: ReactNode;
  helper?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-stone-800">{label}</label>
      {children}
      {helper ? <p className="text-xs text-stone-500">{helper}</p> : null}
    </div>
  );
}

export const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-900/10";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-stone-200 ${className}`} />;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
      {children}
    </div>
  );
}
