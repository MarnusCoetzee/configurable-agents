import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, RunInsight, RunSummary } from "../api";
import { Card } from "../components/Card";
import {
  formatInsightAsMarkdown,
  formatInsightAsSlack,
} from "../lib/exportInsight";

export default function RunInsights() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id);
  const qc = useQueryClient();

  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    enabled: !Number.isNaN(runId),
  });

  const insight = useQuery({
    queryKey: ["insight", runId],
    queryFn: () => api.getInsight(runId),
    enabled: !Number.isNaN(runId),
  });

  const generate = useMutation({
    mutationFn: () => api.generateInsight(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insight", runId] }),
  });

  const regenerate = useMutation({
    mutationFn: () => api.regenerateInsight(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insight", runId] }),
  });

  // Auto-generate on first visit if missing
  useEffect(() => {
    if (
      insight.isFetched &&
      insight.data === null &&
      !generate.isPending &&
      !generate.isSuccess &&
      run.data?.run.final_answer
    ) {
      generate.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight.isFetched, insight.data, run.data?.run.final_answer]);

  if (run.isLoading) return <div className="text-slate-400 text-sm">Loading run…</div>;
  if (!run.data) return null;

  const r = run.data.run;
  const ins = insight.data;
  const generating = generate.isPending || regenerate.isPending;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={`/runs/${runId}`}
            className="text-xs text-slate-400 hover:text-accent transition-colors"
          >
            ← Back to timeline
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            Insights &amp; Actions
          </h1>
          <p className="text-slate-300 text-sm mt-1">{r.user_question}</p>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span>Run #{r.id}</span>
            {r.score !== null && (
              <>
                <span className="text-slate-700">·</span>
                <span className="tabular-nums">
                  {r.score.toFixed(1)}/10 eval score
                </span>
              </>
            )}
          </div>
        </div>
        {ins && (
          <div className="flex items-center gap-2 shrink-0">
            <ExportButtons insight={ins} run={r} />
            <button
              className="text-xs px-3 py-1.5 rounded bg-edge hover:bg-edge/70 text-slate-300 disabled:opacity-50"
              disabled={generating}
              onClick={() => regenerate.mutate()}
            >
              {generating ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        )}
      </header>

      {!ins && generating && (
        <Card>
          <div className="text-sm text-slate-300">Generating insights with MiniMax M2.7…</div>
        </Card>
      )}

      {!ins && !generating && (
        <Card>
          <div className="text-sm text-slate-300 mb-3">
            No insight summary yet for this run.
          </div>
          <button
            className="text-sm px-4 py-2 rounded bg-accent text-ink font-medium"
            onClick={() => generate.mutate()}
          >
            Generate insights
          </button>
        </Card>
      )}

      {ins && (
        <>
          {ins.headline && (
            <Card>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
                Headline
              </div>
              <div className="text-xl font-semibold leading-snug">{ins.headline}</div>
              {ins.tldr && <p className="text-sm text-slate-300 mt-3">{ins.tldr}</p>}
            </Card>
          )}

          {ins.key_metrics.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {ins.key_metrics.map((m, i) => (
                <div
                  key={i}
                  className="bg-panel border border-edge rounded p-3"
                >
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    {m.label}
                  </div>
                  <div className="text-base font-semibold mt-1">{m.value}</div>
                </div>
              ))}
            </div>
          )}

          {ins.key_actions.length > 0 && (
            <Card title="Key actions">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2 pr-4 w-8">#</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Why</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Metric</th>
                  </tr>
                </thead>
                <tbody>
                  {ins.key_actions.map((a, i) => (
                    <tr key={i} className="border-t border-edge align-top">
                      <td className="py-3 pr-4 text-slate-500">{i + 1}</td>
                      <td className="py-3 pr-4 font-medium">{a.action}</td>
                      <td className="py-3 pr-4 text-slate-300">{a.rationale}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-accent text-xs">
                        {a.metric}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {ins.watch_outs.length > 0 && (
            <Card title="Watch-outs">
              <ul className="space-y-3">
                {ins.watch_outs.map((w, i) => (
                  <li key={i} className="border-l-2 border-amber-500/50 pl-3">
                    <div className="text-sm text-slate-200">{w.risk}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      <span className="text-slate-500">Mitigation:</span> {w.mitigation}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <ChatPanel runId={runId} />
        </>
      )}
    </div>
  );
}

function ExportButtons({
  insight,
  run,
}: {
  insight: RunInsight;
  run: RunSummary;
}) {
  const [copied, setCopied] = useState<"md" | "slack" | null>(null);

  const copy = async (kind: "md" | "slack") => {
    const text =
      kind === "md"
        ? formatInsightAsMarkdown(insight, run)
        : formatInsightAsSlack(insight, run);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Fallback: open a download with the text
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `run-${run.id}-${kind === "md" ? "insights.md" : "insights-slack.txt"}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const downloadMd = () => {
    const text = formatInsightAsMarkdown(insight, run);
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${run.id}-insights.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        className="text-xs px-3 py-1.5 rounded bg-edge hover:bg-edge/70 text-slate-300"
        onClick={() => copy("md")}
        title="Copy as Markdown (tables, headings)"
      >
        {copied === "md" ? "Copied ✓" : "Copy MD"}
      </button>
      <button
        className="text-xs px-3 py-1.5 rounded bg-edge hover:bg-edge/70 text-slate-300"
        onClick={() => copy("slack")}
        title="Copy as Slack-formatted text (mrkdwn)"
      >
        {copied === "slack" ? "Copied ✓" : "Copy Slack"}
      </button>
      <button
        className="text-xs px-3 py-1.5 rounded bg-edge hover:bg-edge/70 text-slate-300"
        onClick={downloadMd}
        title="Download as .md file"
      >
        ⬇ .md
      </button>
    </>
  );
}

function ChatPanel({ runId }: { runId: number }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ["insight-messages", runId],
    queryFn: () => api.listInsightMessages(runId),
  });

  const send = useMutation({
    mutationFn: (msg: string) => api.sendInsightMessage(runId, msg),
    onMutate: () => setInput(""),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insight-messages", runId] }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.data?.length, send.isPending]);

  const suggested = [
    "What's the single biggest risk in this plan?",
    "Which campaign should we cut first?",
    "Quantify the upside of the top recommendation.",
  ];

  return (
    <Card title="Ask follow-up questions">
      <div
        ref={scrollRef}
        className="max-h-96 overflow-y-auto space-y-3 mb-3"
      >
        {(!messages.data || messages.data.length === 0) && (
          <div className="text-sm text-slate-400">
            Ask anything about this recommendation. The model has the full agent output as context.
          </div>
        )}
        {messages.data?.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] text-sm rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-accent/15 text-slate-100 border border-accent/30"
                  : "bg-edge text-slate-200"
              }`}
            >
              {m.content}
              {m.role === "assistant" && m.latency_ms > 0 && (
                <div className="text-[10px] text-slate-500 mt-1">
                  {m.latency_ms}ms · {m.tokens_used} tok
                </div>
              )}
            </div>
          </div>
        ))}
        {send.isPending && (
          <div className="flex justify-start">
            <div className="bg-edge text-slate-400 text-sm rounded-lg px-3 py-2 animate-pulse">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {(!messages.data || messages.data.length === 0) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {suggested.map((s) => (
            <button
              key={s}
              className="text-[11px] px-2 py-1 rounded bg-edge hover:bg-edge/70 text-slate-300"
              onClick={() => send.mutate(s)}
              disabled={send.isPending}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 bg-ink border border-edge rounded px-3 py-2 text-sm"
          placeholder="Ask a follow-up question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim() && !send.isPending) {
              send.mutate(input.trim());
            }
          }}
        />
        <button
          className="text-sm px-4 py-2 rounded bg-accent text-ink font-medium disabled:opacity-50"
          disabled={send.isPending || !input.trim()}
          onClick={() => input.trim() && send.mutate(input.trim())}
        >
          {send.isPending ? "…" : "Send"}
        </button>
      </div>

      {send.isError && (
        <div className="text-rose-300 text-xs mt-2">
          {(send.error as Error).message}
        </div>
      )}
    </Card>
  );
}
