import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Link } from "react-router-dom";
import { api, EvalRow } from "../api";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { SkeletonCard } from "../components/Skeleton";
import { StatusPill, scoreTone } from "../components/StatusPill";
import { relativeTime, score } from "../lib/format";

const dims: { key: keyof EvalRow; label: string; color: string }[] = [
  { key: "accuracy_score", label: "Accuracy", color: "#a78bfa" },
  { key: "evidence_score", label: "Evidence", color: "#34d399" },
  { key: "usefulness_score", label: "Usefulness", color: "#fbbf24" },
  { key: "compliance_score", label: "Compliance", color: "#fb7185" },
];

export default function Evals() {
  const qc = useQueryClient();
  const evals = useQuery({
    queryKey: ["evals"],
    queryFn: api.listEvals,
    refetchInterval: 5000,
  });

  const apply = useMutation({
    mutationFn: (evalId: number) => api.applyPatch(evalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evals"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const reEval = useMutation({
    mutationFn: (evalId: number) => api.reEvaluate(evalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evals"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const chartData =
    evals.data
      ?.slice()
      .reverse()
      .map((e) => ({
        run: `#${e.run_id}`,
        Overall: e.overall_score,
        Accuracy: e.accuracy_score,
        Evidence: e.evidence_score,
        Usefulness: e.usefulness_score,
        Compliance: e.compliance_score,
      })) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Evaluations</h1>
        <p className="text-slate-400 text-sm mt-1">
          The QA evaluator scores every run on four dimensions and proposes a
          targeted prompt patch for the agent it judges weakest.
        </p>
      </header>

      {chartData.length > 1 && (
        <Card title="Score over time">
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1c2740" vertical={false} />
                <XAxis
                  dataKey="run"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine y={9} stroke="#34d399" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{
                    background: "#0f192e",
                    border: "1px solid #1c2740",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="Overall" stroke="#7dd3fc" strokeWidth={2.5} dot={{ r: 3 }} />
                {dims.map((d) => (
                  <Line
                    key={d.key}
                    type="monotone"
                    dataKey={d.label}
                    stroke={d.color}
                    strokeWidth={1}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {evals.isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} rows={4} />
          ))}
        </div>
      )}

      {!evals.isLoading && (evals.data?.length ?? 0) === 0 && (
        <Card>
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 17 8 12l4 4 9-9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="No evaluations yet"
            description="Run a workflow on the Runs page — every completed run is scored automatically."
          />
        </Card>
      )}

      <div className="space-y-4">
        {evals.data?.map((e) => (
          <EvalCard
            key={e.id}
            row={e}
            applying={apply.isPending && apply.variables === e.id}
            reEvaluating={reEval.isPending && reEval.variables === e.id}
            onApply={() => apply.mutate(e.id)}
            onReEvaluate={() => reEval.mutate(e.id)}
          />
        ))}
      </div>

      {apply.isError && (
        <div className="text-rose-300 text-xs">{(apply.error as Error).message}</div>
      )}
    </div>
  );
}

function EvalCard({
  row,
  applying,
  reEvaluating,
  onApply,
  onReEvaluate,
}: {
  row: EvalRow;
  applying: boolean;
  reEvaluating: boolean;
  onApply: () => void;
  onReEvaluate: () => void;
}) {
  const unparsed = row.overall_score === null;
  const tone = scoreTone(row.overall_score);

  return (
    <div className="bg-panel border border-edge rounded-xl p-5 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <Link
            to={`/runs/${row.run_id}`}
            className="text-sm font-semibold hover:text-accent transition-colors"
          >
            Run #{row.run_id}
          </Link>
          <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">
            {row.run.user_question}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {relativeTime(row.created_at)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={`text-3xl font-semibold tabular-nums ${
              tone === "success"
                ? "text-emerald-300"
                : tone === "danger"
                ? "text-rose-300"
                : tone === "warning"
                ? "text-amber-300"
                : "text-slate-100"
            }`}
          >
            {score(row.overall_score, 2)}
            <span className="text-sm text-slate-600">/10</span>
          </div>
          {unparsed && row.raw_qa_text && (
            <button
              className="mt-1 text-[11px] px-2 py-1 rounded bg-edge hover:bg-edge/70 text-slate-300 disabled:opacity-50"
              disabled={reEvaluating}
              onClick={onReEvaluate}
            >
              {reEvaluating ? "Re-evaluating…" : "Re-evaluate"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {dims.map((d) => {
          const v = row[d.key] as number | null;
          return (
            <div key={d.key} className="bg-ink rounded-md p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                {d.label}
              </div>
              <div className="text-sm font-semibold tabular-nums mt-0.5">
                {score(v)}
              </div>
            </div>
          );
        })}
      </div>

      {row.weakness && (
        <div className="text-xs text-slate-300 mb-3 bg-ink/50 border border-edge rounded p-3">
          <span className="text-slate-500 uppercase text-[10px] tracking-wider">
            Weakness ·{" "}
          </span>
          {row.weakness}
        </div>
      )}

      {row.suggested_patch && row.suggested_patch_target_agent && (
        <div className="bg-ink border border-edge rounded-md p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Suggested patch →{" "}
              <span className="text-slate-300 normal-case font-medium">
                {row.suggested_patch_target_agent}
              </span>
            </div>
            {row.patch_applied && (
              <StatusPill tone="success">applied</StatusPill>
            )}
          </div>
          <div className="text-sm text-slate-200 leading-relaxed mb-3">
            {row.suggested_patch}
          </div>
          {!row.patch_applied && (
            <button
              className="text-xs px-3 py-1.5 rounded-md bg-accent text-ink font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
              disabled={applying}
              onClick={onApply}
            >
              {applying ? "Applying…" : "Accept patch"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
