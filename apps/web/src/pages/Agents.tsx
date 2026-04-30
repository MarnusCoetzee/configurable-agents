import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, Agent } from "../api";
import { SkeletonCard } from "../components/Skeleton";
import { StatusPill } from "../components/StatusPill";

export default function Agents() {
  const qc = useQueryClient();
  const agents = useQuery({ queryKey: ["agents"], queryFn: api.listAgents });
  const [editing, setEditing] = useState<Agent | null>(null);

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Agent> }) =>
      api.updateAgent(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      setEditing(null);
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-slate-400 text-sm mt-1">
          Six specialized agents collaborate on each workflow. Edit a prompt or
          revert to a prior version through history.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.isLoading &&
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} rows={4} />)}

        {agents.data?.map((a) => (
          <div
            key={a.id}
            className="bg-panel border border-edge rounded-xl p-5 hover:border-edge/80 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{a.name}</h3>
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    v{a.version}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {a.role} · {a.model} · temp {a.temperature.toFixed(1)}
                </div>
              </div>
              <StatusPill tone={a.enabled ? "success" : "neutral"}>
                {a.enabled ? "enabled" : "disabled"}
              </StatusPill>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed mb-3 line-clamp-2">
              {a.goal}
            </p>
            <div className="flex flex-wrap gap-1 mb-4">
              {a.tools.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-edge text-slate-400 font-mono"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="text-xs px-3 py-1.5 rounded-md bg-edge hover:bg-edge/70 text-slate-200 transition-colors"
                onClick={() => setEditing(a)}
              >
                Edit prompt
              </button>
              <Link
                to={`/agents/${a.id}/history`}
                className="text-xs px-3 py-1.5 rounded-md bg-edge hover:bg-edge/70 text-slate-200 transition-colors"
              >
                History
              </Link>
              <button
                className="text-xs px-3 py-1.5 rounded-md bg-edge hover:bg-edge/70 text-slate-200 ml-auto transition-colors"
                onClick={() =>
                  updateMut.mutate({ id: a.id, body: { enabled: !a.enabled } })
                }
              >
                {a.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 fade-in">
          <div className="bg-panel border border-edge rounded-xl w-full max-w-2xl p-6 shadow-glow">
            <h2 className="text-lg font-semibold mb-1">Edit {editing.name}</h2>
            <div className="text-xs text-slate-500 mb-4">v{editing.version} → v{editing.version + 1} on save</div>

            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              Goal
            </label>
            <textarea
              className="w-full bg-ink border border-edge rounded-md p-2.5 text-sm mb-3 mt-1 focus:border-accent/50 focus:outline-none transition-colors"
              rows={2}
              defaultValue={editing.goal}
              onChange={(e) => (editing.goal = e.target.value)}
            />

            <label className="text-[11px] uppercase tracking-wider text-slate-500">
              System prompt
            </label>
            <textarea
              className="w-full bg-ink border border-edge rounded-md p-2.5 text-sm mb-3 mt-1 font-mono focus:border-accent/50 focus:outline-none transition-colors"
              rows={10}
              defaultValue={editing.system_prompt}
              onChange={(e) => (editing.system_prompt = e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500">
                  Temperature
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={1}
                  className="w-full bg-ink border border-edge rounded-md p-2.5 text-sm mt-1 tabular-nums focus:border-accent/50 focus:outline-none transition-colors"
                  defaultValue={editing.temperature}
                  onChange={(e) =>
                    (editing.temperature = Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500">
                  Model
                </label>
                <input
                  className="w-full bg-ink border border-edge rounded-md p-2.5 text-sm mt-1 font-mono focus:border-accent/50 focus:outline-none transition-colors"
                  defaultValue={editing.model}
                  onChange={(e) => (editing.model = e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="text-sm px-3 py-2 rounded-md bg-edge text-slate-200 hover:bg-edge/70 transition-colors"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                className="text-sm px-4 py-2 rounded-md bg-accent text-ink font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
                disabled={updateMut.isPending}
                onClick={() =>
                  updateMut.mutate({
                    id: editing.id,
                    body: {
                      goal: editing.goal,
                      system_prompt: editing.system_prompt,
                      temperature: editing.temperature,
                      model: editing.model,
                    },
                  })
                }
              >
                {updateMut.isPending ? "Saving…" : "Save & bump version"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
