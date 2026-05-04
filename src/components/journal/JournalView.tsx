import { useState, useMemo, useEffect } from "react";
import type { WheelCycle, IBKRTrade } from "../../types";
import type { MonthlyIncome, TickerPnL, PerformanceStats, DailyPnL, CalendarMonth } from "../../engine/wheels";
import { computePerformanceStats, buildDailyPnL, buildCumulativePnL, buildCalendarData } from "../../engine/wheels";
import { MiniLineChart } from "../charts/MiniLineChart";
import { MiniBarChart } from "../charts/MiniBarChart";

type Tab = "profit" | "calendar" | "wheels" | "trades" | "ticker";

interface Props {
  cycles: WheelCycle[];
  trades: IBKRTrade[];
  monthlyIncome: MonthlyIncome[];
  tickerPnL: TickerPnL[];
  hasData: boolean;
  initialTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; short: string }[] = [
  { id: "profit", label: "Profit View", short: "Profit" },
  { id: "calendar", label: "Calendar", short: "Cal" },
  { id: "wheels", label: "Open Wheels", short: "Wheels" },
  { id: "trades", label: "Trades", short: "Trades" },
  { id: "ticker", label: "Per-Ticker", short: "Ticker" },
];

export function JournalView({ cycles, trades, monthlyIncome, tickerPnL, hasData, initialTab, onTabChange }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "profit");
  const changeTab = (t: Tab) => { setTab(t); onTabChange?.(t); };

  // Derived data
  const perfStats = useMemo(() => computePerformanceStats(cycles, trades), [cycles, trades]);
  const dailyPnL = useMemo(() => buildDailyPnL(trades), [trades]);
  const cumulativePnL = useMemo(() => buildCumulativePnL(dailyPnL), [dailyPnL]);
  const calendarData = useMemo(() => buildCalendarData(trades), [trades]);

  // Sync tab from sidebar navigation
  useEffect(() => {
    if (initialTab && initialTab !== tab) setTab(initialTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  if (!hasData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center text-3xl">📓</div>
        <div>
          <p className="text-white font-semibold">No journal data yet</p>
          <p className="text-neutral-500 text-sm mt-1">Sync your IBKR account to populate the journal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Mobile tab bar (hidden on desktop where sidebar handles this) */}
      <div className="flex gap-1 px-4 py-2.5 border-b border-white/[0.06] lg:hidden">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              tab === t.id
                ? "bg-white/10 text-white"
                : "text-neutral-500 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            {t.short}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 flex flex-col gap-4 max-w-4xl">
        {tab === "profit"   && <ProfitTab stats={perfStats} monthly={monthlyIncome} dailyPnL={dailyPnL} cumulativePnL={cumulativePnL} cycles={cycles} />}
        {tab === "calendar" && <CalendarTab months={calendarData} />}
        {tab === "wheels"   && <WheelsTab cycles={cycles} />}
        {tab === "trades"   && <TradesTab trades={trades} />}
        {tab === "ticker"   && <TickerTab tickerPnL={tickerPnL} />}
      </div>
    </div>
  );
}

// ── Profit View ─────────────────────────────────────────────────────────────

function ProfitTab({ stats, monthly, dailyPnL, cumulativePnL, cycles }: {
  stats: PerformanceStats; monthly: MonthlyIncome[]; dailyPnL: DailyPnL[];
  cumulativePnL: { label: string; value: number }[]; cycles: WheelCycle[];
}) {
  const bestChains = [...cycles].filter(c => c.totalPremiumCollected > 0).sort((a, b) => {
    const aPnL = a.status === "closed" ? a.netPnL : a.totalPremiumCollected - a.totalCostToClose;
    const bPnL = b.status === "closed" ? b.netPnL : b.totalPremiumCollected - b.totalCostToClose;
    return bPnL - aPnL;
  }).slice(0, 5);

  const worstChains = [...cycles].filter(c => c.totalPremiumCollected > 0).sort((a, b) => {
    const aPnL = a.status === "closed" ? a.netPnL : a.totalPremiumCollected - a.totalCostToClose;
    const bPnL = b.status === "closed" ? b.netPnL : b.totalPremiumCollected - b.totalCostToClose;
    return aPnL - bPnL;
  }).slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlassCard
          label="Net P&L"
          value={`${stats.netPnL >= 0 ? "+" : ""}$${Math.abs(stats.netPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub={`${stats.totalTrades} trades`}
          color={stats.netPnL >= 0 ? "emerald" : "rose"}
        />
        <GlassCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          sub={`${stats.winCount}W / ${stats.lossCount}L`}
          color={stats.winRate >= 50 ? "emerald" : "amber"}
        />
        <GlassCard
          label="Profit Factor"
          value={stats.profitFactor >= 100 ? "∞" : stats.profitFactor.toFixed(2)}
          sub="Gross P / Gross L"
          color={stats.profitFactor >= 1 ? "cyan" : "rose"}
        />
        <GlassCard
          label="Avg Win / Loss"
          value={`$${stats.avgWin.toFixed(0)}`}
          sub={`$${stats.avgLoss.toFixed(0)} avg loss · ${stats.avgWinLossRatio.toFixed(2)}r`}
          color="sky"
        />
      </div>

      {/* Chain stats row */}
      <div className="grid grid-cols-3 gap-3">
        <GlassCard label="Open Chains" value={String(stats.openChains)} color="sky" />
        <GlassCard label="Closed Chains" value={String(stats.closedChains)} color="slate" />
        <GlassCard
          label="Chain Win %"
          value={`${stats.chainWinRate.toFixed(0)}%`}
          color={stats.chainWinRate >= 50 ? "emerald" : "amber"}
        />
      </div>

      {/* Cumulative P&L Chart */}
      {cumulativePnL.length > 1 && (
        <ChartCard title="Cumulative P&L">
          <MiniLineChart data={cumulativePnL} height={140} color={cumulativePnL[cumulativePnL.length - 1]?.value >= 0 ? "emerald" : "rose"} showArea />
        </ChartCard>
      )}

      {/* Monthly P&L Bar Chart */}
      {monthly.length > 0 && (
        <ChartCard title="Monthly P&L">
          <MiniBarChart
            data={monthly.map(m => ({ label: m.label, value: m.netIncome }))}
            height={100}
            formatValue={v => `${v >= 0 ? "+" : ""}$${Math.abs(v).toLocaleString()}`}
          />
          <div className="flex justify-between px-1 mt-2">
            {monthly.slice(-3).reverse().map(m => (
              <div key={m.month} className="text-center">
                <p className="text-neutral-500 text-xs">{m.label}</p>
                <p className={`font-semibold text-xs ${m.netIncome >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {m.netIncome >= 0 ? "+" : ""}${m.netIncome.toFixed(0)}
                </p>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Daily P&L */}
      {dailyPnL.length > 1 && (
        <ChartCard title="Daily P&L">
          <MiniBarChart
            data={dailyPnL.map(d => ({ label: d.label, value: d.value }))}
            height={80}
            formatValue={v => `${v >= 0 ? "+" : ""}$${Math.abs(v).toLocaleString()}`}
          />
        </ChartCard>
      )}

      {/* Max Drawdown */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-neutral-400 text-xs font-medium">Max Drawdown</span>
          <span className="text-rose-400 font-bold text-sm">-{stats.maxDrawdownPct.toFixed(1)}%</span>
        </div>
        <div className="mt-2 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full" style={{ width: `${Math.min(stats.maxDrawdownPct, 100)}%` }} />
        </div>
      </div>

      {/* Best Chains */}
      {bestChains.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Best Chains</h3>
          {bestChains.map(c => <MiniChainCard key={c.id} cycle={c} />)}
        </div>
      )}

      {/* Worst Chains */}
      {worstChains.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Worst Chains</h3>
          {worstChains.map(c => <MiniChainCard key={c.id} cycle={c} />)}
        </div>
      )}
    </div>
  );
}

// ── Calendar View ───────────────────────────────────────────────────────────

function CalendarTab({ months }: { months: CalendarMonth[] }) {
  if (months.length === 0) return <EmptyState text="No trade data for calendar." />;

  return (
    <div className="flex flex-col gap-6">
      {months.map(m => (
        <div key={m.month} className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">{m.label}</h3>
            <span className={`text-sm font-bold ${m.monthPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {m.monthPnL >= 0 ? "+" : ""}${m.monthPnL.toFixed(0)}
            </span>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
              <div key={d} className="text-center text-neutral-600 text-xs font-medium py-1">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for offset */}
            {Array.from({ length: m.firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {/* Actual days */}
            {Array.from({ length: m.totalDays }).map((_, i) => {
              const day = i + 1;
              const entry = m.days.find(d => d.dayOfMonth === day);
              const pnl = entry?.pnl ?? 0;
              const hasTrade = !!entry;
              return (
                <div
                  key={day}
                  className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all ${
                    hasTrade
                      ? pnl >= 0
                        ? "bg-emerald-500/15 border border-emerald-500/20"
                        : "bg-rose-500/15 border border-rose-500/20"
                      : "bg-neutral-800/30"
                  }`}
                >
                  <span className="text-neutral-500" style={{ fontSize: "9px" }}>{day}</span>
                  {hasTrade && (
                    <span className={`font-bold ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`} style={{ fontSize: "8px" }}>
                      {pnl >= 0 ? "+" : ""}{pnl >= 1000 || pnl <= -1000 ? `${(pnl / 1000).toFixed(1)}k` : pnl.toFixed(0)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Wheels Tab ──────────────────────────────────────────────────────────────

const WHEEL_STAGES = ["CSP", "Roll", "Assign", "CC", "Expire", "Close"] as const;

function getStageIndex(status: string): number {
  switch (status) {
    case "csp_open": return 0;
    case "assigned": return 2;
    case "cc_open": return 3;
    case "closed": return 5;
    default: return 0;
  }
}

function WheelStageBar({ status }: { status: string }) {
  const active = getStageIndex(status);
  return (
    <div className="flex items-center gap-0.5 my-1">
      {WHEEL_STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center gap-0.5">
          <div className={`px-1.5 py-0.5 rounded text-xs font-medium transition-all ${
            i <= active
              ? i === active
                ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-500/30"
                : "bg-emerald-500/20 text-emerald-400"
              : "bg-neutral-800 text-neutral-600"
          }`} style={{ fontSize: "9px" }}>
            {stage}
          </div>
          {i < WHEEL_STAGES.length - 1 && (
            <div className={`w-2 h-px ${i < active ? "bg-emerald-500/40" : "bg-neutral-700"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function WheelsTab({ cycles }: { cycles: WheelCycle[] }) {
  const open = cycles.filter(c => c.status !== "closed");
  const closed = cycles.filter(c => c.status === "closed");

  return (
    <>
      {open.length === 0 && <EmptyState text="No open wheel cycles." />}

      {open.map(c => <WheelCard key={c.id} cycle={c} />)}

      {closed.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mt-3">Closed Cycles</h3>
          {closed.slice(0, 10).map(c => <WheelCard key={c.id} cycle={c} />)}
          {closed.length > 10 && (
            <p className="text-xs text-neutral-600 text-center">{closed.length - 10} more closed cycles</p>
          )}
        </>
      )}
    </>
  );
}

const statusConfig: Record<string, { label: string; gradient: string }> = {
  csp_open: { label: "CSP Open", gradient: "from-rose-500 to-pink-500" },
  assigned: { label: "Assigned", gradient: "from-amber-500 to-orange-500" },
  cc_open:  { label: "CC Open",  gradient: "from-violet-500 to-purple-500" },
  closed:   { label: "Closed",   gradient: "from-neutral-500 to-neutral-600" },
};

const legIcon: Record<string, string> = {
  SELL_PUT: "↓P", BUY_PUT: "↑P", BUY_STOCK: "↓S",
  SELL_CALL: "↓C", BUY_CALL: "↑C", SELL_STOCK: "↑S",
};

function WheelCard({ cycle: c }: { cycle: WheelCycle }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[c.status] ?? statusConfig.closed;
  const net = c.status === "closed" ? c.netPnL : c.totalPremiumCollected - c.totalCostToClose;
  const isProfit = net >= 0;

  return (
    <div className="glass-card overflow-hidden">
      <button onClick={() => setExpanded(v => !v)} className="w-full p-4 flex items-start justify-between gap-2 text-left">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm">{c.symbol}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r ${cfg.gradient} text-white`}>
              {cfg.label}
            </span>
          </div>
          <WheelStageBar status={c.status} />
          <div className="flex gap-3 text-xs text-neutral-500">
            <span>{c.startDate.slice(0, 10)} → {c.endDate?.slice(0, 10) ?? "present"}</span>
            <span>{c.legs.length} trades</span>
          </div>
          {c.totalPremiumCollected > 0 && (
            <span className="text-xs text-emerald-400/80">${c.totalPremiumCollected.toFixed(0)} collected</span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-bold text-sm ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
            {isProfit ? "+" : "-"}${Math.abs(net).toFixed(0)}
          </div>
          <div className="text-xs text-neutral-600">{c.status === "closed" ? "realized" : "unrealized"}</div>
          <div className="text-neutral-600 text-xs mt-1">{expanded ? "▲" : "▼"}</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3 flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2 text-center mb-2">
            <MiniStat label="Collected" value={`+$${c.totalPremiumCollected.toFixed(0)}`} color="text-emerald-400" />
            <MiniStat label="Paid" value={`-$${c.totalCostToClose.toFixed(0)}`} color="text-rose-400" />
            <MiniStat label="Net" value={`${isProfit ? "+" : "-"}$${Math.abs(net).toFixed(0)}`} color={isProfit ? "text-emerald-400" : "text-rose-400"} />
          </div>
          {c.legs.map((leg, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-xs ${
                  leg.netCash >= 0 ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"
                }`}>
                  {legIcon[leg.legType] ?? leg.legType}
                </span>
                <span className="text-neutral-400 truncate max-w-[180px]">{leg.description}</span>
              </div>
              <span className={leg.netCash >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {leg.netCash >= 0 ? "+" : ""}${leg.netCash.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trades Tab ──────────────────────────────────────────────────────────────

function TradesTab({ trades }: { trades: IBKRTrade[] }) {
  const sorted = [...trades].reverse();
  if (sorted.length === 0) return <EmptyState text="No trades found." />;

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((t, i) => (
        <div key={t.id || i} className="glass-card p-3.5 flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-white text-sm">{t.symbol}</span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                t.buySell === "SELL" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
              }`}>{t.buySell}</span>
              {t.assetCategory === "OPT" && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  t.putCall === "P" ? "bg-rose-500/10 text-rose-300" : "bg-violet-500/10 text-violet-300"
                }`}>{t.putCall === "P" ? "PUT" : "CALL"}</span>
              )}
            </div>
            <span className="text-xs text-neutral-500 truncate">
              {t.assetCategory === "OPT" ? `$${t.strike} ${t.expiry} × ${t.quantity}` : `${t.quantity} shares @ $${t.tradePrice.toFixed(2)}`}
            </span>
            <span className="text-xs text-neutral-600">{t.dateTime.slice(0, 10)}</span>
          </div>
          <div className="shrink-0 text-right">
            <div className={`font-bold text-sm ${t.netCash >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {t.netCash >= 0 ? "+" : ""}${Math.abs(t.netCash).toFixed(0)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Per-Ticker Tab ──────────────────────────────────────────────────────────

function TickerTab({ tickerPnL }: { tickerPnL: TickerPnL[] }) {
  if (tickerPnL.length === 0) return <EmptyState text="No ticker data." />;

  const maxCollected = Math.max(...tickerPnL.map(t => t.totalCollected), 1);

  return (
    <div className="flex flex-col gap-2">
      {tickerPnL.map(t => (
        <div key={t.symbol} className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{t.symbol}</span>
              <span className="text-xs text-neutral-500">{t.tradeCount} trades</span>
              {t.cycleCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  t.winCount / t.cycleCount >= 0.5 ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                }`}>{t.winCount}/{t.cycleCount} wins</span>
              )}
            </div>
            <span className={`font-bold text-sm ${t.netRealized >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {t.netRealized >= 0 ? "+" : ""}${t.netRealized.toFixed(0)}
            </span>
          </div>
          {/* Progress bar showing collected premium relative to max */}
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all"
              style={{ width: `${(t.totalCollected / maxCollected) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-neutral-500">
            <span>${t.totalCollected.toFixed(0)} collected</span>
            <span>${t.totalPaid.toFixed(0)} paid</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shared components ───────────────────────────────────────────────────────

const GRADIENT_COLORS: Record<string, string> = {
  emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
  rose: "from-rose-500/10 to-rose-500/5 border-rose-500/20",
  cyan: "from-cyan-500/10 to-cyan-500/5 border-cyan-500/20",
  sky: "from-sky-500/10 to-sky-500/5 border-sky-500/20",
  amber: "from-amber-500/10 to-amber-500/5 border-amber-500/20",
  violet: "from-violet-500/10 to-violet-500/5 border-violet-500/20",
  slate: "from-neutral-500/10 to-neutral-500/5 border-neutral-500/20",
};

const TEXT_COLORS: Record<string, string> = {
  emerald: "text-emerald-400", rose: "text-rose-400", cyan: "text-cyan-400",
  sky: "text-sky-400", amber: "text-amber-400", violet: "text-violet-400", slate: "text-neutral-300",
};

function GlassCard({ label, value, sub, color = "slate" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3.5 ${GRADIENT_COLORS[color] ?? GRADIENT_COLORS.slate}`}>
      <p className="text-neutral-400 text-xs font-medium">{label}</p>
      <p className={`font-bold text-lg mt-0.5 ${TEXT_COLORS[color] ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-neutral-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function MiniChainCard({ cycle: c }: { cycle: WheelCycle }) {
  const net = c.status === "closed" ? c.netPnL : c.totalPremiumCollected - c.totalCostToClose;
  return (
    <div className="glass-card p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-bold text-white text-sm">{c.symbol}</span>
        <WheelStageBar status={c.status} />
      </div>
      <span className={`font-bold text-sm ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {net >= 0 ? "+" : ""}${net.toFixed(0)}
      </span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-neutral-900/50 rounded-lg p-2">
      <p className="text-neutral-500 text-xs">{label}</p>
      <p className={`font-bold text-xs ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-neutral-500 text-sm text-center mt-8">{text}</p>;
}
