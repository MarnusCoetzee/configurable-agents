import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";
import { StatusPill, runStatusTone } from "../components/StatusPill";
import { relativeTime, score } from "../lib/format";

const SUGGESTED = [
  "Which campaign should we scale next month if we care about profitable policy acquisition, not just lead volume?",
  "Why is the Facebook Young Drivers campaign producing cheap leads but poor margin?",
  "Which customer segments deserve more spend?",
];

export default function Runs() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: api.listRuns,
    refetchInterval: 4000,
  });
  const [question, setQuestion] = useState(SUGGESTED[0]);

  const create = useMutation({
    mutationFn: (q: string) => api.createRun(q),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      navigate(`/runs/${data.run_id}`);
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Workflow Runs</h1>
        <p className="text-slate-400 text-sm mt-1">
          Six agents reason in sequence over campaign and policy data, then a
          QA evaluator scores the result and proposes a prompt patch.
        </p>
      </header>

      <Card title="Start a run">
        <div className="space-y-3">
          <textarea
            className="w-full bg-ink border border-edge rounded-md p-3 text-sm placeholder:text-slate-600 focus:border-accent/50 focus:outline-none transition-colors"
            rows={3}
            value={question}
            placeholder="Ask the agent workflow a question…"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                className="text-[11px] px-2.5 py-1 rounded-full bg-edge hover:bg-edge/70 text-slate-300 transition-colors"
                onClick={() => setQuestion(s)}
              >
                {s.slice(0, 56)}…
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              Workflow: <span className="text-slate-300">campaign-recommendation</span>{" "}
              · 6 agents · ~3 min
            </div>
            <button
              className="text-sm px-4 py-2 rounded-md bg-accent text-ink font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
              disabled={create.isPending || !question.trim()}
              onClick={() => create.mutate(question)}
            >
              {create.isPending ? "Queueing…" : "Run workflow →"}
            </button>
          </div>
          {create.isError && (
            <div className="text-rose-300 text-xs">
              {(create.error as Error).message}
            </div>
          )}
        </div>
      </Card>

      <Card title={runs.data ? `${runs.data.length} run${runs.data.length === 1 ? "" : "s"}` : "Runs"}>
        {runs.isLoading && (
          <div className="-my-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}
        {!runs.isLoading && (runs.data?.length ?? 0) === 0 && (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="m9 9 6 3-6 3z" fill="currentColor" />
              </svg>
            }
            title="No runs yet"
            description="Pick a suggestion above or write your own question to start the agent workflow."
          />
        )}
        <div className="divide-y divide-edge -my-1">
          {runs.data?.map((r) => (
            <Link
              key={r.id}
              to={`/runs/${r.id}`}
              className="flex items-start gap-4 py-3 hover:bg-edge/30 px-2 -mx-2 rounded transition-colors"
            >
              <div className="text-xs text-slate-500 w-12 shrink-0 mt-0.5 tabular-nums">
                #{r.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 line-clamp-1">
                  {r.user_question}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>{relativeTime(r.created_at)}</span>
                  <span className="text-slate-700">·</span>
                  <span>{r.workflow_name}</span>
                </div>
              </div>
              <StatusPill tone={runStatusTone(r.status)} dot>
                {r.status}
              </StatusPill>
              <div className="w-12 text-right text-xs text-slate-300 tabular-nums">
                {r.score !== null ? (
                  <>
                    {score(r.score)}
                    <span className="text-slate-600">/10</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
