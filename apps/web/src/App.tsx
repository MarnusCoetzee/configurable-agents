import { useEffect } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Campaigns from "./pages/Campaigns";
import Runs from "./pages/Runs";
import RunDetail from "./pages/RunDetail";
import Evals from "./pages/Evals";
import AgentHistory from "./pages/AgentHistory";
import RunInsights from "./pages/RunInsights";
import { BrandMark } from "./components/Brand";

const navItems: {
  to: string;
  label: string;
  end?: boolean;
  icon: React.ReactNode;
}[] = [
  { to: "/", label: "Dashboard", end: true, icon: <IconHome /> },
  { to: "/runs", label: "Runs", icon: <IconRuns /> },
  { to: "/evals", label: "Evals", icon: <IconEvals /> },
  { to: "/agents", label: "Agents", icon: <IconAgents /> },
  { to: "/campaigns", label: "Campaigns", icon: <IconCampaigns /> },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/runs": "Runs",
  "/evals": "Evals",
  "/agents": "Agents",
  "/campaigns": "Campaigns",
};

function PageTitle() {
  const location = useLocation();
  useEffect(() => {
    const base = "Cockpit";
    const match = TITLES[location.pathname];
    if (match) {
      document.title = `${match} · ${base}`;
    } else if (location.pathname.startsWith("/runs/")) {
      document.title = `Run · ${base}`;
    } else if (location.pathname.startsWith("/agents/")) {
      document.title = `Agent · ${base}`;
    } else {
      document.title = base;
    }
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <div className="min-h-full flex bg-ink">
      <PageTitle />
      <aside className="w-60 bg-panel border-r border-edge flex flex-col">
        <div className="px-5 pt-6 pb-5 flex items-center gap-2.5">
          <BrandMark size={28} />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Cockpit</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              Insurance AgentOps
            </div>
          </div>
        </div>

        <nav className="px-3 flex flex-col gap-0.5 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? "bg-edge text-accent"
                    : "text-slate-300 hover:bg-edge/60 hover:text-slate-100"
                }`
              }
            >
              <span className="text-slate-500 group-[.active]:text-accent">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-5 py-5 border-t border-edge">
          <div className="text-[11px] text-slate-500 leading-relaxed">
            Powered by{" "}
            <span className="text-slate-300">MiniMax M2.7</span>
          </div>
          <div className="text-[10px] text-slate-600 mt-1">
            AcmeSure Auto &amp; Home · demo
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-hero">
        <div className="max-w-7xl mx-auto px-8 py-10 fade-in">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/runs/:id/insights" element={<RunInsights />} />
            <Route path="/evals" element={<Evals />} />
            <Route path="/agents/:id/history" element={<AgentHistory />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

// ---- Inline icons (no dep) ---------------------------------------------

function IconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12 12 3l9 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRuns() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 3-6 3z" fill="currentColor" />
    </svg>
  );
}
function IconEvals() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17 8 12l4 4 9-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 8h7v7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconAgents() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" strokeLinecap="round" />
    </svg>
  );
}
function IconCampaigns() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11v3h3l5 4V7L6 11H3z" strokeLinejoin="round" />
      <path d="M16 8s2 1.5 2 4-2 4-2 4" strokeLinecap="round" />
    </svg>
  );
}
