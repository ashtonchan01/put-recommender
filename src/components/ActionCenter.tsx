import type { Action, ActionUrgency, IBKRSyncData, RiskSettings } from "../types";
import type { PortfolioStats } from "../services/ibkr";

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
}

const urgencyConfig: Record<ActionUrgency, { label: string; dot: string; border: string; bg: string }> = {
  urgent:      { label: "URGENT",      dot: "bg-rose-500",    border: "border-rose-500/40",   bg: "bg-rose-400/5"    },
  manage:      { label: "MANAGE",      dot: "bg-amber-400",   border: "border-amber-400/40",  bg: "bg-amber-400/5"   },
  opportunity: { label: "OPPORTUNITY", dot: "bg-emerald-500", border: "border-emerald-500/40", bg: "bg-emerald-400/5" },
};

const actionTypeLabel: Record<string, string> = {
  CLOSE_PROFIT: "Close for profit",
  ROLL_WINNER:  "Roll winner",
  ROLL_LOSER:   "Roll to recover",
  TAKE_LOSS:    "Take the loss",
  SELL_CALL:    "Sell covered call",
  SELL_PUT:     "Sell cash-secured put",
};

const actionTypeColor: Record<string, string> = {
  CLOSE_PROFIT: "text-emerald-400",
  ROLL_WINNER:  "text-sky-400",
  ROLL_LOSER:   "text-amber-400",
  TAKE_LOSS:    "text-rose-400",
  SELL_CALL:    "text-violet-400",
  SELL_PUT:     "text-emerald-400",
};

export function ActionCenter({ actions, stats, syncData, risk, onSync, syncing, syncError, hasScanned, onScan }: Props) {
  const urgent      = actions.filter(a => a.urgency === "urgent");
  const manage      = actions.filter(a => a.urgency === "manage");
  const opportunity = actions.filter(a => a.urgency === "opportunity");

  const lastSyncLabel = syncData?.lastSync
    ? new Date(syncData.lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
      style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>

      {/* Sync bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex-1 py-2.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white font-medium rounded-xl text-sm transition-colors"
        >
          {syncing ? "Syncing with IBKR…" : "Sync Portfolio"}
        </button>
        {!hasScanned && (
          <button
            onClick={onScan}
            className="px-3 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Scan
          </button>
        )}
      </div>

      {syncError && (
        <div className="bg-rose-900/30 border border-rose-700/50 rounded-xl px-4 py-3 text-sm text-rose-300">
          {syncError}
        </div>
      )}

      {/* Portfolio summary */}
      {stats && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">Portfolio</span>
            {lastSyncLabel && <span className="text-xs text-slate-500">Synced {lastSyncLabel}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox
              label="Unrealized P&L"
              value={(stats.totalUnrealizedPnL >= 0 ? "+" : "") + fmt(stats.totalUnrealizedPnL)}
              color={stats.totalUnrealizedPnL >= 0 ? "text-emerald-400" : "text-rose-400"}
            />
            <StatBox label="YTD Premium" value={fmt(stats.ytdPremiumCollected)} color="text-sky-400" />
            <StatBox label="Short Puts" value={String(stats.shortPutCount)} color="text-rose-300" />
            <StatBox label="Short Calls" value={String(stats.shortCallCount)} color="text-violet-300" />
            <StatBox label="Collateral Used" value={fmtK(stats.totalCollateralUsed)} color="text-slate-300" />
            <StatBox
              label="Available"
              value={fmtK(Math.max(0, risk.portfolioSize - stats.totalCollateralUsed))}
              color="text-emerald-300"
            />
          </div>
        </div>
      )}

      {/* No data states */}
      {!syncData && !syncing && (
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5 text-center flex flex-col gap-3">
          <p className="text-slate-300 font-semibold text-sm">Connect your IBKR account</p>
          <p className="text-slate-500 text-xs">
            Go to Settings → IBKR to add your Flex token and Query ID, then tap Sync.
          </p>
        </div>
      )}

      {syncData && actions.length === 0 && !syncing && (
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5 text-center flex flex-col gap-3">
          <div className="text-3xl">✓</div>
          <p className="text-slate-300 font-semibold text-sm">All clear — nothing needs action right now</p>
          {!hasScanned && (
            <p className="text-slate-500 text-xs">Run a scan to see new CSP opportunities.</p>
          )}
        </div>
      )}

      {/* Urgent */}
      {urgent.length > 0 && (
        <ActionGroup label="URGENT — Act now" urgency="urgent" actions={urgent} />
      )}

      {/* Manage */}
      {manage.length > 0 && (
        <ActionGroup label="MANAGE — Review positions" urgency="manage" actions={manage} />
      )}

      {/* Opportunities */}
      {opportunity.length > 0 && (
        <ActionGroup label="OPPORTUNITIES" urgency="opportunity" actions={opportunity} />
      )}

      {/* Risk rules reminder */}
      {(syncData || hasScanned) && (
        <div className="border border-slate-700/40 rounded-xl p-3.5 flex flex-col gap-1.5">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">Active rules</p>
          <Rule text={`Close winners at 50% of max profit`} />
          <Rule text={`Roll losers at 50% of max loss, not indefinitely`} />
          <Rule text={`Never sell when IV Rank < 20`} />
          <Rule text={`Roll at 21 DTE, don't wait for expiry`} />
          <Rule text={`Max ${risk.maxRiskPct}% portfolio per trade = $${((risk.portfolioSize * risk.maxRiskPct) / 100).toLocaleString()}`} />
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
        <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
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
    <div className={`rounded-xl border p-3.5 flex flex-col gap-2 ${cfg.border} ${cfg.bg}`}>
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
            {a.pnlPct !== undefined && (
              <div className="text-xs text-slate-500">{a.pnlPct.toFixed(0)}% of max</div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-400 border-t border-slate-700/40 pt-2">{a.detail}</div>

      {/* Scan pick details for opportunities */}
      {a.scanPick && (
        <div className="grid grid-cols-3 gap-1 text-center bg-slate-900/60 rounded-lg p-2">
          <MiniMetric label="Delta" value={a.scanPick.contract.delta.toFixed(2)} />
          <MiniMetric label="IV Rank" value={`${a.scanPick.ivRank}%`} />
          <MiniMetric label="Ann. Return" value={`${a.scanPick.annualizedReturn.toFixed(0)}%`} />
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-2.5">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className={`font-semibold text-sm ${color}`}>{value}</p>
    </div>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-slate-500">
      <span className="text-emerald-600 shrink-0">✓</span>
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
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtK(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}
