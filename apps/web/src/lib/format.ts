const ZAR_FMT = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

const NUM_FMT = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });

export const zar = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : ZAR_FMT.format(n);

/** Compact ZAR: R1.2M, R45K — for tight cards. */
export function zarCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `R${(n / 1_000).toFixed(0)}K`;
  return `R${Math.round(n)}`;
}

export const num = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : NUM_FMT.format(n);

export const pct = (n: number | null | undefined, fractionDigits = 0): string =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : `${(n * 100).toFixed(fractionDigits)}%`;

export const score = (n: number | null | undefined, fractionDigits = 1): string =>
  n === null || n === undefined ? "—" : n.toFixed(fractionDigits);

/** Friendly relative time: "just now", "3m ago", "2h ago", "yesterday", date. */
export function relativeTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const diffSec = (Date.now() - date.getTime()) / 1000;

  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${Math.floor(diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 2) return "yesterday";
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;

  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function fullTimestamp(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
