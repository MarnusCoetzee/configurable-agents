const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export type Agent = {
  id: number;
  name: string;
  role: string;
  goal: string;
  system_prompt: string;
  model: string;
  temperature: number;
  tools: string[];
  version: number;
  enabled: boolean;
  created_at: string;
};

export type CampaignRow = {
  id: number;
  name: string;
  channel: string;
  spend_zar: number;
  leads: number;
  quotes: number;
  policies: number;
  premium_zar: number;
  acquisition_cost_zar: number;
  sum_premium_zar: number;
  sum_expected_loss_zar: number;
  sum_margin_zar: number;
  cost_per_lead_zar: number;
  cost_per_policy_zar: number;
  risk_adjusted_roas: number;
};

export type DashboardSummary = {
  total_agent_runs: number;
  average_eval_score: number | null;
  open_recommendations: number;
  best_campaign_by_margin: {
    name: string;
    sum_margin_zar: number;
    loss_ratio: number;
  } | null;
  worst_campaign_by_loss_ratio: {
    name: string;
    sum_margin_zar: number;
    loss_ratio: number;
  } | null;
  eval_trajectory: { run_id: number; score: number | null; at: string }[];
  recent_runs: {
    id: number;
    user_question: string;
    status: "pending" | "running" | "completed" | "failed";
    score: number | null;
    created_at: string;
  }[];
  latest_insight: {
    run_id: number;
    headline: string | null;
    tldr: string | null;
    score: number | null;
    user_question: string;
    created_at: string;
  } | null;
};

export type EvalRow = {
  id: number;
  run_id: number;
  accuracy_score: number | null;
  evidence_score: number | null;
  usefulness_score: number | null;
  compliance_score: number | null;
  overall_score: number | null;
  weakness: string | null;
  suggested_patch_target_agent: string | null;
  suggested_patch: string | null;
  patch_applied: boolean;
  raw_qa_text: string | null;
  created_at: string;
  run: RunSummary;
};

export type RunSummary = {
  id: number;
  workflow_name: string;
  user_question: string;
  status: "pending" | "running" | "completed" | "failed";
  final_answer: string | null;
  score: number | null;
  created_at: string;
  completed_at: string | null;
};

export type RunStep = {
  id: number;
  run_id: number;
  agent_id: number | null;
  agent_name: string;
  step_order: number;
  input: Record<string, unknown>;
  output: {
    text?: string;
    reasoning?: string;
    finish_reason?: string | null;
  } & Record<string, unknown>;
  tool_calls: { tool: string; result_summary: string }[];
  latency_ms: number;
  tokens_used: number;
  created_at: string;
};

export type RunDetail = { run: RunSummary; steps: RunStep[] };

export const api = {
  listAgents: () => http<Agent[]>("/agents"),
  updateAgent: (id: number, body: Partial<Agent>) =>
    http<Agent>(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  listCampaigns: () => http<CampaignRow[]>("/campaigns"),
  dashboardSummary: () => http<DashboardSummary>("/dashboard/summary"),
  listRuns: () => http<RunSummary[]>("/runs"),
  createRun: (user_question: string) =>
    http<{ run_id: number; status: string }>("/runs", {
      method: "POST",
      body: JSON.stringify({ user_question }),
    }),
  getRun: (id: number) => http<RunDetail>(`/runs/${id}`),
  listEvals: () => http<EvalRow[]>("/evals"),
  applyPatch: (evalId: number) =>
    http<{ agent_id: number; agent_name: string; new_version: number }>(
      `/evals/${evalId}/apply-patch`,
      { method: "POST" },
    ),
  reEvaluate: (evalId: number) =>
    http<EvalRow>(`/evals/${evalId}/re-evaluate`, { method: "POST" }),
  promptHistory: (agentId: number) =>
    http<PromptVersionEntry[]>(`/agents/${agentId}/prompt-history`),
  revertTo: (agentId: number, versionId: number) =>
    http<{ new_version: number; reverted_to_version: number }>(
      `/agents/${agentId}/revert-to/${versionId}`,
      { method: "POST" },
    ),
  getInsight: async (runId: number): Promise<RunInsight | null> => {
    try {
      return await http<RunInsight>(`/runs/${runId}/insights`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("404")) return null;
      throw err;
    }
  },
  generateInsight: (runId: number) =>
    http<RunInsight>(`/runs/${runId}/insights/generate`, { method: "POST" }),
  regenerateInsight: (runId: number) =>
    http<RunInsight>(`/runs/${runId}/insights/regenerate`, { method: "POST" }),
  listInsightMessages: (runId: number) =>
    http<InsightMessage[]>(`/runs/${runId}/insights/messages`),
  sendInsightMessage: (runId: number, message: string) =>
    http<InsightMessage>(`/runs/${runId}/insights/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};

export type RunInsight = {
  id: number;
  run_id: number;
  headline: string | null;
  tldr: string | null;
  key_actions: { action: string; rationale: string; metric: string }[];
  watch_outs: { risk: string; mitigation: string }[];
  key_metrics: { label: string; value: string }[];
  created_at: string;
};

export type InsightMessage = {
  id: number;
  run_id: number;
  role: "user" | "assistant";
  content: string;
  tokens_used: number;
  latency_ms: number;
  created_at: string;
};

export type PromptVersionEntry = {
  id: number;
  version: number;
  prompt: string;
  diff_from_previous: string[];
  parent_eval_id: number | null;
  weakness: string | null;
  active_from: string;
  active_until: string | null;
  is_current: boolean;
  runs: { id: number; score: number | null; status: string; created_at: string }[];
  avg_score: number | null;
  run_count: number;
};
