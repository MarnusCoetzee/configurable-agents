import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, CampaignRow } from "../api";
import { Card } from "../components/Card";
import { Skeleton } from "../components/Skeleton";
import { num, pct, zar, zarCompact } from "../lib/format";

type SortKey =
  | "name"
  | "spend_zar"
  | "leads"
  | "policies"
  | "cost_per_policy_zar"
  | "sum_margin_zar"
  | "loss_ratio"
  | "risk_adjusted_roas";

export default function Campaigns() {
  const q = useQuery({ queryKey: ["campaigns"], queryFn: api.listCampaigns });
  const [sortBy, setSortBy] = useState<SortKey>("risk_adjusted_roas");
  const [desc, setDesc] = useState(true);

  const rows = (q.data ?? [])
    .map((c) => ({
      ...c,
      loss_ratio:
        c.sum_premium_zar > 0
          ? c.sum_expected_loss_zar / c.sum_premium_zar
          : 0,
    }))
    .sort((a, b) => {
      const av = a[sortBy as keyof typeof a] as number | string;
      const bv = b[sortBy as keyof typeof b] as number | string;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });

  const onSort = (k: SortKey) => {
    if (sortBy === k) setDesc((d) => !d);
    else {
      setSortBy(k);
      setDesc(true);
    }
  };

  const totals = (q.data ?? []).reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend_zar,
      margin: acc.margin + c.sum_margin_zar,
      policies: acc.policies + c.policies,
    }),
    { spend: 0, margin: 0, policies: 0 },
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-slate-400 text-sm mt-1">
          Marketing performance enriched with policy margin and expected loss —
          the data the agents reason over.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MiniMetric label="Total spend" value={zarCompact(totals.spend)} loading={q.isLoading} />
        <MiniMetric label="Total margin" value={zarCompact(totals.margin)} loading={q.isLoading} />
        <MiniMetric label="Total policies" value={num(totals.policies)} loading={q.isLoading} />
      </div>

      <Card>
        {q.isLoading ? (
          <Skeleton width="100%" height={400} />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <Th k="name" current={sortBy} desc={desc} onClick={onSort} className="text-left normal-case tracking-wider">
                    Campaign
                  </Th>
                  <Th k="name" current={sortBy} desc={desc} onClick={() => onSort("name")} className="text-left">
                    Channel
                  </Th>
                  <Th k="spend_zar" current={sortBy} desc={desc} onClick={onSort} className="text-right">
                    Spend
                  </Th>
                  <Th k="leads" current={sortBy} desc={desc} onClick={onSort} className="text-right">
                    Leads
                  </Th>
                  <Th k="policies" current={sortBy} desc={desc} onClick={onSort} className="text-right">
                    Policies
                  </Th>
                  <Th k="cost_per_policy_zar" current={sortBy} desc={desc} onClick={onSort} className="text-right">
                    CAC
                  </Th>
                  <Th k="sum_margin_zar" current={sortBy} desc={desc} onClick={onSort} className="text-right">
                    Margin
                  </Th>
                  <Th k="loss_ratio" current={sortBy} desc={desc} onClick={onSort} className="text-right">
                    Loss%
                  </Th>
                  <Th k="risk_adjusted_roas" current={sortBy} desc={desc} onClick={onSort} className="text-right">
                    ROAS
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const negative = c.sum_margin_zar < c.spend_zar * 0.2;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-edge hover:bg-edge/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-slate-100">
                        {c.name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-xs">
                        {c.channel}
                      </td>
                      <td className="py-2.5 px-3 text-right">{zar(c.spend_zar)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {num(c.leads)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {num(c.policies)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {zar(c.cost_per_policy_zar)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-medium ${
                          negative ? "text-rose-300" : "text-emerald-300"
                        }`}
                      >
                        {zar(c.sum_margin_zar)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right ${
                          c.loss_ratio > 0.7
                            ? "text-rose-300"
                            : c.loss_ratio < 0.45
                            ? "text-emerald-300"
                            : "text-slate-300"
                        }`}
                      >
                        {pct(c.loss_ratio)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-accent text-xs font-medium">
                        {(c.risk_adjusted_roas * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({
  k,
  current,
  desc,
  onClick,
  className = "",
  children,
}: {
  k: SortKey;
  current: SortKey;
  desc: boolean;
  onClick: (k: SortKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = k === current;
  return (
    <th
      className={`py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors select-none ${className} ${
        active ? "text-accent" : ""
      }`}
      onClick={() => onClick(k)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (
          <span className="text-[8px]">{desc ? "▼" : "▲"}</span>
        )}
      </span>
    </th>
  );
}

function MiniMetric({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-panel border border-edge rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      {loading ? (
        <Skeleton width="60%" height={24} className="mt-2" />
      ) : (
        <div className="text-xl font-semibold tabular-nums mt-1.5">{value}</div>
      )}
    </div>
  );
}
