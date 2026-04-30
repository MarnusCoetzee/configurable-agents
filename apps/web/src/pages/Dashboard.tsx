import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { Card } from "../components/Card";
import { Sparkline } from "../components/Sparkline";
import { Skeleton } from "../components/Skeleton";
import {
  StatusPill,
  Tone,
  runStatusTone,
  scoreTone,
} from "../components/StatusPill";
import { num, relativeTime, score, zar, zarCompact } from "../lib/format";

/** Shorten a campaign name for chart labels: keeps the disambiguating tail. */
function shortLabel(name: string): string {
  // "Google Search: Auto Insurance" -> "Auto Search"
  // "Email: Home Insurance Renewal" -> "Home Email"
  // "Comparison Site: Hippo Aggregator" -> "Hippo Compare"
  const [prefix, tail] = name.split(":").map((s) => s.trim());
  if (!tail) return prefix;
  const tailHead = tail.split(" ")[0];
  return `${tailHead} ${prefix.split(" ")[0]}`;
}

export default function Dashboard() {
  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: api.dashboardSummary,
    refetchInterval: 8000,
  });
  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: api.listCampaigns,
  });

  const trajectory = summary.data?.eval_trajectory.map((t) => t.score) ?? [];
  const lastScore = trajectory.length ? trajectory[trajectory.length - 1] : null;
  const prevScore =
    trajectory.length > 1 ? trajectory[trajectory.length - 2] : null;
  const delta =
    lastScore !== null && prevScore !== null && lastScore !== undefined && prevScore !== undefined
      ? lastScore - prevScore
      : null;

  const chartData =
    campaigns.data
      ?.slice()
      .sort((a, b) => b.sum_margin_zar - a.sum_margin_zar)
      .slice(0, 10)
      .map((c) => ({
        name: shortLabel(c.name),
        fullName: c.name,
        Spend: c.spend_zar,
        Margin: c.sum_margin_zar,
      })) ?? [];

  return (
    <div className="space-y-8">
      <header>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
          AcmeSure Auto &amp; Home Insurance
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">
          Risk-aware campaign intelligence
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-2xl">
          Configure agents, run autonomous workflows over campaign and policy
          data, and watch a self-improvement loop close through structured evals.
        </p>
      </header>

      {/* Hero metric strip — equal heights guaranteed */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroMetric
          label="Agent runs"
          value={summary.data ? num(summary.data.total_agent_runs) : null}
          loading={summary.isLoading}
          hint="lifetime"
        />
        <HeroMetric
          label="Avg eval score"
          value={summary.data ? score(summary.data.average_eval_score) : null}
          suffix="/10"
          loading={summary.isLoading}
          tone={scoreTone(summary.data?.average_eval_score)}
          hint={
            delta !== null ? (
              <span
                className={`font-medium ${
                  delta >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)} vs prev run
              </span>
            ) : (
              "across all runs"
            )
          }
          trend={
            trajectory.length > 1 ? (
              <Sparkline
                values={trajectory.map((v) => (v ?? null) as number | null)}
                width={228}
                height={32}
                domain={[
                  Math.max(
                    0,
                    Math.min(
                      ...trajectory.filter((v): v is number => v !== null),
                    ) - 1,
                  ),
                  10,
                ]}
              />
            ) : undefined
          }
        />
        <HeroMetric
          label="Open recommendations"
          value={summary.data ? num(summary.data.open_recommendations) : null}
          loading={summary.isLoading}
          hint={
            summary.data && summary.data.open_recommendations > 0
              ? "unapplied prompt patches"
              : "all caught up"
          }
          link={summary.data?.open_recommendations ? "/evals" : undefined}
          tone={
            summary.data && summary.data.open_recommendations > 0
              ? "warning"
              : "neutral"
          }
        />
        <HeroMetric
          label="Best margin channel"
          value={
            summary.data?.best_campaign_by_margin
              ? summary.data.best_campaign_by_margin.name
                  .replace(/^.*?:\s*/, "")
              : null
          }
          loading={summary.isLoading}
          hint={
            summary.data?.best_campaign_by_margin
              ? `${zarCompact(
                  summary.data.best_campaign_by_margin.sum_margin_zar,
                )} margin`
              : undefined
          }
          tone="success"
          valueClassName="text-base leading-tight line-clamp-2"
        />
      </div>

      {/* Latest insight banner */}
      {summary.data?.latest_insight && (
        <Link
          to={`/runs/${summary.data.latest_insight.run_id}/insights`}
          className="group block bg-panel border border-edge rounded-xl p-5 hover:shadow-glow hover:border-accent/40 transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M9.5 2 12 8l6 .5-4.5 4 1.5 6L9.5 15 4 18.5 5.5 12.5 1 8.5l6-.5z"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-[0.16em]">
                <span>Latest insight</span>
                <span className="text-slate-700">·</span>
                <span>
                  {relativeTime(summary.data.latest_insight.created_at)}
                </span>
              </div>
              <div className="text-base font-semibold mt-1 truncate">
                {summary.data.latest_insight.headline ?? "Insight ready"}
              </div>
              {summary.data.latest_insight.tldr && (
                <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                  {summary.data.latest_insight.tldr}
                </p>
              )}
            </div>
            <div className="shrink-0 self-center text-slate-500 group-hover:text-accent transition-colors">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </Link>
      )}

      {/* Two-column body — chart + recent runs (equal heights) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2">
          <Card title="Spend vs margin · top 10 channels" className="h-full flex flex-col">
            {campaigns.isLoading ? (
              <Skeleton width="100%" height={300} />
            ) : (
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                    barCategoryGap="22%"
                  >
                    <CartesianGrid stroke="#1c2740" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => zarCompact(v)}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f192e",
                        border: "1px solid #1c2740",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(_label, payload) =>
                        payload?.[0]?.payload?.fullName ?? ""
                      }
                      formatter={(v: number) => zar(v)}
                      cursor={{ fill: "rgba(125,211,252,0.05)" }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar
                      dataKey="Spend"
                      fill="#475569"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={42}
                    />
                    <Bar
                      dataKey="Margin"
                      fill="#7dd3fc"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={42}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        <Card title="Recent runs" className="h-full">
          {summary.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={56} />
              ))}
            </div>
          ) : summary.data?.recent_runs.length === 0 ? (
            <div className="text-sm text-slate-400">
              No runs yet —{" "}
              <Link to="/runs" className="text-accent hover:underline">
                start one
              </Link>
              .
            </div>
          ) : (
            <ul className="divide-y divide-edge -my-1">
              {summary.data?.recent_runs.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/runs/${r.id}`}
                    className="grid grid-cols-[24px_1fr_auto] gap-3 items-center py-3 hover:bg-edge/30 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="text-[11px] text-slate-500 tabular-nums shrink-0">
                      #{r.id}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-slate-200 line-clamp-2 leading-snug">
                        {r.user_question}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {relativeTime(r.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.score !== null && (
                        <span className="text-[11px] text-slate-300 tabular-nums">
                          {r.score.toFixed(1)}
                        </span>
                      )}
                      <StatusPill tone={runStatusTone(r.status)} dot>
                        {r.status}
                      </StatusPill>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Insight callout */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-md bg-amber-500/15 text-amber-300 flex items-center justify-center">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2 2 22h20L12 2z" strokeLinejoin="round" />
              <path d="M12 9v5m0 4v.01" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-sm text-slate-300 leading-relaxed">
            The cheapest leads (TikTok, Snapchat, Facebook Young Drivers) are{" "}
            <span className="text-rose-300">not</span> the most profitable.
            Email Renewal, Referral Broker, and WhatsApp Opt-in win on
            risk-adjusted margin. The agent workflow is built to surface that
            pattern automatically — and the eval loop catches when it doesn't.
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Hero metric card. Fixed grid: label · value · hint · trend.
 * Every card occupies the same vertical space regardless of which slots are filled. */
function HeroMetric({
  label,
  value,
  suffix,
  hint,
  trend,
  tone,
  link,
  loading,
  valueClassName = "",
}: {
  label: string;
  value: string | null;
  suffix?: string;
  hint?: React.ReactNode;
  trend?: React.ReactNode;
  tone?: Tone;
  link?: string;
  loading?: boolean;
  valueClassName?: string;
}) {
  const inner = (
    <div
      className={`bg-panel border border-edge rounded-xl p-5 grid grid-rows-[auto_1fr_auto_auto] gap-2 min-h-[156px] transition-all ${
        link ? "hover:shadow-glow hover:border-accent/40 cursor-pointer" : ""
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 leading-none">
        {label}
      </div>

      <div className="flex items-baseline gap-1.5 min-w-0">
        {loading ? (
          <Skeleton width="60%" height={28} />
        ) : (
          <>
            <span
              className={`text-2xl font-semibold tabular-nums truncate ${
                tone === "success"
                  ? "text-emerald-300"
                  : tone === "danger"
                  ? "text-rose-300"
                  : tone === "warning"
                  ? "text-amber-300"
                  : "text-slate-100"
              } ${valueClassName}`}
            >
              {value ?? "—"}
            </span>
            {suffix && value !== null && (
              <span className="text-sm text-slate-500 shrink-0">{suffix}</span>
            )}
          </>
        )}
      </div>

      <div className="text-[11px] text-slate-500 leading-snug min-h-[16px]">
        {hint ?? ""}
      </div>

      <div className="min-h-[34px] flex items-end">
        {trend ?? null}
      </div>
    </div>
  );

  return link ? <Link to={link}>{inner}</Link> : inner;
}
