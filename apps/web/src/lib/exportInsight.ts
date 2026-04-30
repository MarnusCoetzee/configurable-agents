import { RunInsight, RunSummary } from "../api";

export function formatInsightAsMarkdown(
  insight: RunInsight,
  run: Pick<RunSummary, "id" | "user_question" | "score">,
): string {
  const lines: string[] = [];

  lines.push(`# ${insight.headline ?? `Run #${run.id} insights`}`);
  lines.push("");
  lines.push(`**Question:** ${run.user_question}`);
  if (run.score !== null) lines.push(`**Eval score:** ${run.score.toFixed(1)}/10`);
  lines.push("");

  if (insight.tldr) {
    lines.push("## TL;DR");
    lines.push(insight.tldr);
    lines.push("");
  }

  if (insight.key_metrics.length > 0) {
    lines.push("## Key metrics");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|---|---|");
    for (const m of insight.key_metrics) {
      lines.push(`| ${m.label} | ${m.value} |`);
    }
    lines.push("");
  }

  if (insight.key_actions.length > 0) {
    lines.push("## Key actions");
    lines.push("");
    lines.push("| # | Action | Why | Metric |");
    lines.push("|---|---|---|---|");
    insight.key_actions.forEach((a, i) => {
      const action = a.action.replace(/\|/g, "\\|");
      const why = a.rationale.replace(/\|/g, "\\|");
      const metric = a.metric.replace(/\|/g, "\\|");
      lines.push(`| ${i + 1} | ${action} | ${why} | ${metric} |`);
    });
    lines.push("");
  }

  if (insight.watch_outs.length > 0) {
    lines.push("## Watch-outs");
    lines.push("");
    for (const w of insight.watch_outs) {
      lines.push(`- **${w.risk}**`);
      lines.push(`  - _Mitigation:_ ${w.mitigation}`);
    }
    lines.push("");
  }

  lines.push(`_Generated ${new Date(insight.created_at).toLocaleString()} from run #${run.id}._`);
  return lines.join("\n");
}

export function formatInsightAsSlack(
  insight: RunInsight,
  run: Pick<RunSummary, "id" | "user_question" | "score">,
): string {
  const lines: string[] = [];
  lines.push(`*${insight.headline ?? `Run #${run.id} insights`}*`);
  lines.push(`> ${run.user_question}`);
  if (run.score !== null) lines.push(`_Eval score: ${run.score.toFixed(1)}/10_`);
  lines.push("");

  if (insight.tldr) {
    lines.push(insight.tldr);
    lines.push("");
  }

  if (insight.key_actions.length > 0) {
    lines.push("*Actions*");
    insight.key_actions.forEach((a, i) => {
      lines.push(`${i + 1}. *${a.action}* — ${a.rationale} _(${a.metric})_`);
    });
    lines.push("");
  }

  if (insight.watch_outs.length > 0) {
    lines.push("*Watch-outs*");
    for (const w of insight.watch_outs) {
      lines.push(`• ${w.risk}`);
      lines.push(`   ↳ _${w.mitigation}_`);
    }
    lines.push("");
  }

  if (insight.key_metrics.length > 0) {
    const compact = insight.key_metrics
      .map((m) => `${m.label}: ${m.value}`)
      .join(" · ");
    lines.push(`_${compact}_`);
  }

  return lines.join("\n");
}
