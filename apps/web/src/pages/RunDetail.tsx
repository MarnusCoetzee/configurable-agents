import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, RunStep } from "../api";
import { Card } from "../components/Card";
import { StatusPill, runStatusTone } from "../components/StatusPill";
import { fullTimestamp, relativeTime, score } from "../lib/format";

const TOTAL_STEPS = 6;

const AGENT_INITIAL: Record<string, string> = {
  "Campaign Analyst": "CA",
  "Risk & Profitability": "R&P",
  "Segment Discovery": "SD",
  "Marketing Strategist": "MS",
  "Compliance Reviewer": "CR",
  "QA Evaluator": "QA",
};

const AGENT_ACCENT: Record<string, string> = {
  "Campaign Analyst": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Risk & Profitability": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "Segment Discovery": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Marketing Strategist": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Compliance Reviewer": "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "QA Evaluator": "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id);
  const q = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    enabled: !Number.isNaN(runId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1500;
      const status = data.run.status;
      return status === "running" || status === "pending" ? 1500 : false;
    },
  });

  if (q.isLoading) return <div className="text-slate-400 text-sm">Loading run…</div>;
  if (q.isError) return <div className="text-rose-300 text-sm">{(q.error as Error).message}</div>;
  if (!q.data) return null;

  const { run, steps } = q.data;
  const progress = Math.min(steps.length, TOTAL_STEPS);
  const isLive = run.status === "running" || run.status === "pending";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/runs" className="text-xs text-slate-400 hover:text-accent">
            ← All runs
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            Run #{run.id}
          </h1>
          <p className="text-slate-300 text-sm mt-1">{run.user_question}</p>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span>{relativeTime(run.created_at)}</span>
            <span className="text-slate-700">·</span>
            <span>{run.workflow_name}</span>
          </div>
        </div>
        <div className="text-right shrink-0 space-y-2">
          <StatusPill tone={runStatusTone(run.status)} dot>
            {run.status}
          </StatusPill>
          <div className="text-xs text-slate-400">
            QA score{" "}
            <span className="text-slate-100 font-semibold tabular-nums ml-1">
              {score(run.score)}
            </span>
            <span className="text-slate-600">/10</span>
          </div>
        </div>
      </header>

      {isLive && (
        <Card>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="text-slate-300">Running agent workflow…</span>
            <span className="tabular-nums">
              {progress}/{TOTAL_STEPS}
            </span>
          </div>
          <div className="w-full h-1.5 bg-edge rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-violet rounded-full transition-all duration-500"
              style={{ width: `${(progress / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </Card>
      )}

      {run.final_answer && (
        <Card title="Final answer">
          <pre className="text-sm whitespace-pre-wrap leading-relaxed text-slate-200 font-sans">
            {run.final_answer}
          </pre>
          {run.status === "completed" && (
            <div className="mt-5 flex items-center gap-3">
              <Link
                to={`/runs/${run.id}/insights`}
                className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-accent text-ink font-medium hover:bg-accent/90 transition-colors"
              >
                Get Insights & Actions
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <span className="text-xs text-slate-500">
                Stakeholder-ready summary, with follow-up Q&amp;A
              </span>
            </div>
          )}
        </Card>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 mb-3">
          Agent timeline
        </div>
        <ol className="relative border-l border-edge ml-4 space-y-4">
          {steps.map((s) => (
            <StepCard key={s.id} step={s} />
          ))}
          {isLive && steps.length < TOTAL_STEPS && (
            <li className="ml-6">
              <span className="absolute -left-[7px] flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse" />
              <div className="bg-panel border border-edge border-dashed rounded-lg p-4 text-sm text-slate-400">
                Waiting for step {steps.length + 1} of {TOTAL_STEPS}…
              </div>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

function StepCard({ step }: { step: RunStep }) {
  const [showThinking, setShowThinking] = useState(false);
  const text = step.output?.text ?? "";
  const reasoning = step.output?.reasoning ?? "";
  const finishReason = step.output?.finish_reason;
  const isError = typeof text === "string" && text.startsWith("[error]");
  const truncated = finishReason === "length";

  const initials = AGENT_INITIAL[step.agent_name] ?? step.agent_name.slice(0, 2).toUpperCase();
  const accent =
    AGENT_ACCENT[step.agent_name] ?? "bg-edge text-slate-300 border-slate-500/30";

  return (
    <li className="ml-6">
      <span
        className={`absolute -left-[7px] flex items-center justify-center w-3.5 h-3.5 rounded-full ring-4 ring-ink ${
          isError ? "bg-rose-400" : "bg-accent"
        }`}
      />
      <div
        className={`bg-panel border border-edge rounded-lg p-4 transition-colors ${
          isError ? "border-rose-500/30" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-semibold border tabular-nums ${accent}`}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100 truncate">
                {step.step_order}. {step.agent_name}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums flex items-center gap-2">
                <span>{step.latency_ms}ms</span>
                <span className="text-slate-700">·</span>
                <span>{step.tokens_used} tok</span>
                {truncated && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span className="text-amber-300">truncated</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {step.tool_calls.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {step.tool_calls.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-edge text-slate-300 border border-edge"
                title={t.result_summary}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="m9 18-6-6 6-6m6 0 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-mono">{t.tool}</span>
                <span className="text-slate-500">{t.result_summary}</span>
              </span>
            ))}
          </div>
        )}

        <pre
          className={`text-sm whitespace-pre-wrap leading-relaxed font-sans ${
            isError ? "text-rose-300" : "text-slate-200"
          }`}
        >
          {String(text)}
        </pre>

        {reasoning && (
          <div className="mt-3">
            <button
              className="text-[11px] text-slate-400 hover:text-accent transition-colors flex items-center gap-1"
              onClick={() => setShowThinking((v) => !v)}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  d={showThinking ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {showThinking ? "Hide" : "Show"} reasoning trace ·{" "}
              <span className="tabular-nums">{reasoning.length} chars</span>
            </button>
            {showThinking && (
              <pre className="mt-2 text-[12px] whitespace-pre-wrap leading-relaxed text-slate-500 border-l-2 border-edge pl-3 font-sans">
                {reasoning}
              </pre>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
