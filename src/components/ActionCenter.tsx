import type { Action, ActionUrgency, IBKRSyncData, RiskSettings, WheelCycle } from "../types";
import type { PortfolioStats } from "../services/ibkr";
import type { MonthlyIncome } from "../engine/wheels";

interface Props {
  actions: Action[];
  stats: PortfolioStats | null;
  syncData: IBKRSyncData | null;
  risk: RiskSettings;
  onSync: () => void;
  syncing: boolean;
  syncError: string | null;
  hasScanned: boolean;
  onScan: () => void;
  cycles: WheelCycle[];
  monthlyIncome: MonthlyIncome[];
}

const urgencyConfig: Record<ActionUrgency, { label: string; dot: string; border: string; bg: string }> = {
  urgent:      { label: "URGENT",      dot: "bg-rose-500",    border: "border-rose-500/30",   bg: "from-rose-500/10 to-rose-500/5"    },
  manage:      { label: "MANAGE",      dot: "bg-amber-400",   border: "border-amber-400/30",  bg: "from-amber-400/10 to-amber-400/5"   },
  opportunity: { label: "OPPORTUNITY", dot: "bg-emerald-500", border: "border-emerald-500/30", bg: "from-emerald-400/10 to-emerald-400/5" },
};

const actionTypeLabel: Record<string, string> = {
  CLOSE_PROFIT: "Close for profit", ROLL_WINNER: "Roll winner", ROLL_LOSER: "Roll to recover",
  TAKE_LOSS: "Take the loss", SELL_CALL: "Sell covered call", SELL_PUT: "Sell cash-secured put",
};

const actionTypeColor: Record<string, string> = {
  CLOSE_PROFIT: "text-emerald-400", ROLL_WINNER: "text-sky-400", ROLL_LOSER: "text-amber-400",
  TAKE_LOSS: "text-rose-400", SELL_CALL: "text-violet-400", SELL_PUT: "text-emerald-400",
};

// Wheel stage bar (like QuantWheel)
const STAGES = ["CSP", "Roll", "Assign", "CC", "Expire", "Close"] as const;
function stageIdx(status: string): number {
  return status === "csp_open" ? 0 : status === "assigned" ? 2 : status === "cc_open" ? 3 : status === "closed" ? 5 : 0;
}

export function ActionCenter({ actions, stats, syncData, risk, onSync, syncing, syncError, hasScanned, onScan, cycles, monthlyIncome }: Props) {
  const urgent      = actions.filter(a => a.urgency === "urgent");
  const manage      = actions.filter(a => a.urgency === "manage");
  const opportunity = actions.filter(a => a.urgency === "opportunity");

  const lastSyncLabel = syncData?.lastSync
    ? new Date(syncData.lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const openCycles = cycles.filter(c => c.status !== "closed");
  const totalPremium = cycles.reduce((s, c) => s + c.totalPremiumCollected, 0);
  const ytdPremium = monthlyIncome
    .filter(m => m.month.startsWith(new Date().getFullYear().toString()))
    .reduce((s, m) => s + m.premiumCollected, 0);
  const thisMonth = monthlyIncome.find(m => m.month === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
      style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>

      {/* Sync bar */}
      <div className="flex items-center gap-2">
        <button onClick={onSync} disabled={syncing}
          className="flex-1 py-2.5 bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 disabled:opacity-40 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20">
          {syncing ? "Syncing with IBKR…" : "Sync Portfolio"}
        </button>
        {!hasScanned && (
          <button onClick={onScan}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-emerald-500/20">
            Scan
          </button>
        )}
      </div>

      {syncError && (
        <div className="bg-gradient-to-r from-rose-500/10 to-rose-500/5 border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-rose-300">
          {syncError}
        </div>
      )}

      {/* Premium summary bar (like QuantWheel) */}
      {syncData && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">Premiums Collected</span>
            {lastSyncLabel && <span className="text-xs text-slate-500">Synced {lastSyncLabel}</span>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-slate-500 text-xs">Total</p>
              <p className="text-emerald-400 font-bold text-lg">{fmtK(totalPremium)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">YTD</p>
              <p className="text-sky-400 font-bold text-lg">{fmtK(ytdPremium)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">{thisMonth ? new Date().toLocaleString("default", { month: "short" }) : "This Month"}</p>
              <p className={`font-bold text-lg ${(thisMonth?.netIncome ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {thisMonth ? `${thisMonth.netIncome >= 0 ? "" : "-"}$${Math.abs(thisMonth.netIncome).toFixed(0)}` : "$0"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Unrealized P&L"
            value={(stats.totalUnrealizedPnL >= 0 ? "+" : "") + fmt(stats.totalUnrealizedPnL)}
            color={stats.totalUnrealizedPnL >= 0 ? "emerald" : "rose"}
          />
          <StatCard label="YTD Premium" value={fmt(stats.ytdPremiumCollected)} color="sky" />
          <StatCard label="Short Puts" value={String(stats.shortPutCount)} sub={`${fmtK(stats.totalCollateralUsed)} collateral`} color="rose" />
          <StatCard label="Short Calls" value={String(stats.shortCallCount)} sub={`${fmtK(Math.max(0, risk.portfolioSize - stats.totalCollateralUsed))} available`} color="violet" />
        </div>
      )}

      {/* Open Wheels (with stage bars) */}
      {openCycles.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Open Wheels ({openCycles.length})</h3>
          {openCycles.slice(0, 5).map(c => {
            const net = c.totalPremiumCollected - c.totalCostToClose;
            const activeStage = stageIdx(c.status);
            return (
              <div key={c.id} className="glass-card p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{c.symbol}</span>
                    <span className={`text-xs font-semibold ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {net >= 0 ? "+" : ""}${net.toFixed(0)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">${c.totalPremiumCollected.toFixed(0)} collected</span>
                </div>
                {/* Stage progression */}
                <div className="flex items-center gap-0.5">
                  {STAGES.map((stage, i) => (
                    <div key={stage} className="flex items-center gap-0.5">
                      <div className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        i <= activeStage
                          ? i === activeStage
                            ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white"
                            : "bg-emerald-500/20 text-emerald-400"
                          : "bg-slate-800/80 text-slate-600"
                      }`} style={{ fontSize: "9px" }}>{stage}</div>
                      {i < STAGES.length - 1 && (
                        <div className={`w-1.5 h-px ${i < activeStage ? "bg-emerald-500/40" : "bg-slate-700"}`} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 text-xs text-slate-500 mt-1.5">
                  <span>{c.startDate.slice(0, 10)} → present</span>
                  <span>{c.legs.length} trades</span>
                </div>
              </div>
            );
          })}
          {openCycles.length > 5 && (
            <p className="text-xs text-slate-500 text-center">+{openCycles.length - 5} more</p>
          )}
        </div>
      )}

      {/* No data states */}
      {!syncData && !syncing && (
        <div className="glass-card p-6 text-center flex flex-col gap-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-sky-500/20 to-violet-500/20 flex items-center justify-center text-2xl">⚡</div>
          <p className="text-white font-semibold">Connect your IBKR account</p>
          <p className="text-slate-400 text-sm">Go to Settings → IBKR to add your Flex token and Query ID.</p>
        </div>
      )}

      {syncData && actions.length === 0 && !syncing && (
        <div className="glass-card p-6 text-center flex flex-col gap-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-2xl">✓</div>
          <p className="text-white font-semibold">All clear — nothing needs action</p>
          {!hasScanned && <p className="text-slate-400 text-sm">Run a scan to find CSP opportunities.</p>}
        </div>
      )}

      {/* Action groups */}
      {urgent.length > 0 && <ActionGroup label="URGENT — Act now" urgency="urgent" actions={urgent} />}
      {manage.length > 0 && <ActionGroup label="MANAGE — Review positions" urgency="manage" actions={manage} />}
      {opportunity.length > 0 && <ActionGroup label="OPPORTUNITIES" urgency="opportunity" actions={opportunity} />}

      {/* Rules */}
      {(syncData || hasScanned) && (
        <div className="glass-card p-4 flex flex-col gap-2">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Active Rules</p>
          <Rule text="Close winners at 50% of max profit" />
          <Rule text="Roll losers at 50% of max loss" />
          <Rule text="Never sell when IV Rank < 20" />
          <Rule text="Roll at 21 DTE, don't wait for expiry" />
          <Rule text={`Max ${risk.maxRiskPct}% per trade = $${((risk.portfolioSize * risk.maxRiskPct) / 100).toLocaleString()}`} />
        </div>
      )}
    </div>
  );
}

function ActionGroup({ label, urgency, actions }: { label: string; urgency: ActionUrgency; actions: Action[] }) {
  const cfg = urgencyConfig[urgency];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse`} />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className="text-xs text-slate-600">({actions.length})</span>
      </div>
      {actions.map(a => <ActionCard key={a.id} action={a} />)}
    </div>
  );
}

function ActionCard({ action: a }: { action: Action }) {
  const cfg = urgencyConfig[a.urgency];
  const typeColor = actionTypeColor[a.type] ?? "text-slate-300";

  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 flex flex-col gap-2 ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white">{a.symbol}</span>
            <span className={`text-xs font-semibold ${typeColor}`}>{actionTypeLabel[a.type]}</span>
          </div>
          <span className="text-sm text-slate-200">{a.headline}</span>
        </div>
        {a.pnlDollars !== undefined && (
          <div className="shrink-0 text-right">
            <div className={`text-sm font-bold ${a.pnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {a.pnlDollars >= 0 ? "+" : ""}{fmt(a.pnlDollars)}
            </div>
            {a.pnlPct !== undefined && <div className="text-xs text-slate-500">{a.pnlPct.toFixed(0)}% of max</div>}
          </div>
        )}
      </div>
      <div className="text-xs text-slate-400 border-t border-white/5 pt-2">{a.detail}</div>
      {a.scanPick && (
        <div className="grid grid-cols-3 gap-1 text-center bg-slate-900/40 rounded-lg p-2">
          <MiniMetric label="Delta" value={a.scanPick.contract.delta.toFixed(2)} />
          <MiniMetric label="IV Rank" value={`${a.scanPick.ivRank}%`} />
          <MiniMetric label="Ann. Return" value={`${a.scanPick.annualizedReturn.toFixed(0)}%`} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color = "slate" }: { label: string; value: string; sub?: string; color?: string }) {
  const gradients: Record<string, string> = {
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
    rose: "from-rose-500/10 to-rose-500/5 border-rose-500/20",
    sky: "from-sky-500/10 to-sky-500/5 border-sky-500/20",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/20",
    slate: "from-slate-500/10 to-slate-500/5 border-slate-500/20",
  };
  const textColors: Record<string, string> = {
    emerald: "text-emerald-400", rose: "text-rose-400", sky: "text-sky-400", violet: "text-violet-400", slate: "text-slate-300",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3.5 ${gradients[color] ?? gradients.slate}`}>
      <p className="text-slate-400 text-xs font-medium">{label}</p>
      <p className={`font-bold text-lg ${textColors[color] ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-slate-400">
      <span className="text-emerald-500 shrink-0">✓</span>
      <span>{text}</span>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-500" style={{ fontSize: "10px" }}>{label}</span>
      <span className="text-slate-200 text-xs font-medium">{value}</span>
    </div>
  );
}

function fmt(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtK(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}
