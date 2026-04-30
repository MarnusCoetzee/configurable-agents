import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, PromptVersionEntry } from "../api";
import { Card } from "../components/Card";
import { StatusPill, scoreTone } from "../components/StatusPill";
import { relativeTime, score } from "../lib/format";

export default function AgentHistory() {
  const { id } = useParams<{ id: string }>();
  const agentId = Number(id);
  const qc = useQueryClient();

  const agents = useQuery({ queryKey: ["agents"], queryFn: api.listAgents });
  const history = useQuery({
    queryKey: ["prompt-history", agentId],
    queryFn: () => api.promptHistory(agentId),
    enabled: !Number.isNaN(agentId),
  });

  const revert = useMutation({
    mutationFn: (versionId: number) => api.revertTo(agentId, versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompt-history", agentId] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const agent = agents.data?.find((a) => a.id === agentId);

  if (history.isLoading) return <div className="text-slate-400 text-sm">Loading…</div>;
  if (!history.data) return null;

  const chartData = history.data
    .filter((h) => h.avg_score !== null)
    .map((h) => ({
      version: `v${h.version}`,
      "Avg score": h.avg_score,
      runs: h.run_count,
    }));

  return (
    <div className="space-y-6">
      <header>
        <Link to="/agents" className="text-xs text-slate-400 hover:text-accent transition-colors">
          ← All agents
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">
          {agent?.name ?? "Agent"}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Prompt evolution over time. Every patch is forward-only — reverting
          creates a new version pointing to a prior prompt, nothing is destroyed.
        </p>
      </header>

      {chartData.length > 1 && (
        <Card title="Avg run score per prompt version">
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#1c2740" />
                <XAxis dataKey="version" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[0, 10]} stroke="#94a3b8" fontSize={11} />
                <ReferenceLine y={9} stroke="#34d399" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{
                    background: "#101a2e",
                    border: "1px solid #1c2740",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="Avg score"
                  stroke="#7dd3fc"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {history.data
          .slice()
          .reverse()
          .map((v) => (
            <VersionCard
              key={v.id}
              entry={v}
              reverting={revert.isPending && revert.variables === v.id}
              onRevert={() => revert.mutate(v.id)}
            />
          ))}
      </div>

      {revert.isError && (
        <div className="text-rose-300 text-xs">
          {(revert.error as Error).message}
        </div>
      )}
    </div>
  );
}

function VersionCard({
  entry,
  reverting,
  onRevert,
}: {
  entry: PromptVersionEntry;
  reverting: boolean;
  onRevert: () => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <div
      className={`border rounded-xl p-5 transition-colors ${
        entry.is_current
          ? "border-accent/50 bg-panel shadow-glow"
          : "border-edge bg-panel"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold tabular-nums">
              v{entry.version}
            </span>
            {entry.is_current && (
              <StatusPill tone="info">current</StatusPill>
            )}
            {entry.parent_eval_id !== null && (
              <Link
                to="/evals"
                className="text-[10px] px-2 py-0.5 rounded-full bg-edge text-slate-400 hover:text-accent transition-colors"
              >
                from eval #{entry.parent_eval_id}
              </Link>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Active {relativeTime(entry.active_from)}
            {entry.active_until
              ? ` → ${relativeTime(entry.active_until)}`
              : " → now"}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-2xl font-semibold tabular-nums ${
              scoreTone(entry.avg_score) === "success"
                ? "text-emerald-300"
                : scoreTone(entry.avg_score) === "danger"
                ? "text-rose-300"
                : scoreTone(entry.avg_score) === "warning"
                ? "text-amber-300"
                : "text-slate-100"
            }`}
          >
            {score(entry.avg_score, 2)}
            <span className="text-xs text-slate-600">/10</span>
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            {entry.run_count} run{entry.run_count === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {entry.weakness && (
        <div className="text-xs text-slate-400 mb-3">
          <span className="text-slate-500">Patched in response to:</span>{" "}
          {entry.weakness}
        </div>
      )}

      {entry.diff_from_previous.length > 0 && (
        <div className="bg-ink border border-edge rounded p-3 mb-3 font-mono text-[12px] leading-relaxed overflow-x-auto">
          {entry.diff_from_previous.map((line, i) => {
            let cls = "text-slate-400";
            if (line.startsWith("+")) cls = "text-emerald-300 bg-emerald-500/10";
            else if (line.startsWith("-")) cls = "text-rose-300 bg-rose-500/10";
            else if (line.startsWith("@@")) cls = "text-slate-500";
            return (
              <div key={i} className={`whitespace-pre ${cls}`}>
                {line || " "}
              </div>
            );
          })}
        </div>
      )}

      {entry.runs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {entry.runs.map((r) => (
            <Link
              key={r.id}
              to={`/runs/${r.id}`}
              className="text-[10px] px-2 py-0.5 rounded-full bg-edge text-slate-300 hover:text-accent transition-colors tabular-nums inline-flex items-center gap-1.5"
            >
              <span>#{r.id}</span>
              {r.score !== null && (
                <span className="text-slate-500">·</span>
              )}
              {r.score !== null && (
                <span className="text-slate-400">{r.score.toFixed(1)}</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs">
        <button
          className="text-slate-400 hover:text-accent transition-colors flex items-center gap-1"
          onClick={() => setShowPrompt((v) => !v)}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d={showPrompt ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {showPrompt ? "Hide" : "Show"} full prompt
          <span className="text-slate-600 tabular-nums">
            ({entry.prompt.length} chars)
          </span>
        </button>
        {!entry.is_current && (
          <button
            className="ml-auto text-xs px-3 py-1.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
            disabled={reverting}
            onClick={onRevert}
          >
            {reverting ? "Reverting…" : `Revert to v${entry.version}`}
          </button>
        )}
      </div>

      {showPrompt && (
        <pre className="mt-3 text-[12px] whitespace-pre-wrap leading-relaxed text-slate-300 border-l-2 border-edge pl-3">
          {entry.prompt}
        </pre>
      )}
    </div>
  );
}
