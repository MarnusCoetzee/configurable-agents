export type Tone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "running";

const TONES: Record<Tone, string> = {
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  danger: "bg-rose-500/15 text-rose-300 border-rose-500/25",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  neutral: "bg-slate-600/20 text-slate-300 border-slate-600/30",
  running: "bg-amber-500/15 text-amber-300 border-amber-500/25 animate-pulse",
};

export function StatusPill({
  children,
  tone = "neutral",
  className = "",
  dot = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border tabular-nums ${TONES[tone]} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            tone === "running" ? "bg-amber-400 animate-pulse" : "bg-current"
          }`}
        />
      )}
      {children}
    </span>
  );
}

export function runStatusTone(
  status: "pending" | "running" | "completed" | "failed",
): Tone {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "running":
    case "pending":
      return "running";
    default:
      return "neutral";
  }
}

export function scoreTone(score: number | null | undefined): Tone {
  if (score === null || score === undefined) return "neutral";
  if (score >= 9) return "success";
  if (score >= 7.5) return "info";
  if (score >= 5.5) return "warning";
  return "danger";
}
