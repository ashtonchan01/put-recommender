import { useState } from "react";
import type { WheelCycle, IBKRTrade } from "../../types";
import type { MonthlyIncome, TickerPnL } from "../../engine/wheels";

type Tab = "wheels" | "trades" | "pnl";

interface Props {
  cycles: WheelCycle[];
  trades: IBKRTrade[];
  monthlyIncome: MonthlyIncome[];
  tickerPnL: TickerPnL[];
  hasData: boolean;
}

export function JournalView({ cycles, trades, monthlyIncome, tickerPnL, hasData }: Props) {
  const [tab, setTab] = useState<Tab>("wheels");

  if (!hasData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6"
        style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>
        <div className="text-4xl">📓</div>
        <p className="text-slate-300 font-semibold">No journal data yet</p>
        <p className="text-slate-500 text-sm">Sync your IBKR account from the Action Center to populate the journal.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sub-tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-slate-700/60 bg-slate-900/50">
        {([["wheels", "Open Wheels"], ["trades", "Trades"], ["pnl", "P&L"]] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              tab === id ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
        style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>
        {tab === "wheels" && <WheelsTab cycles={cycles} />}
        {tab === "trades" && <TradesTab trades={trades} />}
        {tab === "pnl" && <PnLTab monthlyIncome={monthlyIncome} tickerPnL={tickerPnL} />}
      </div>
    </div>
  );
}

// ── Open Wheels tab ──────────────────────────────────────────────────────────

function WheelsTab({ cycles }: { cycles: WheelCycle[] }) {
  const open = cycles.filter(c => c.status !== "closed");
  const closed = cycles.filter(c => c.status === "closed");

  return (
    <>
      {open.length === 0 && <p className="text-slate-500 text-sm text-center mt-6">No open wheel cycles.</p>}
      {open.map(c => <WheelCard key={c.id} cycle={c} />)}

      {closed.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2">Closed Cycles</h3>
          {closed.slice(0, 10).map(c => <WheelCard key={c.id} cycle={c} />)}
          {closed.length > 10 && (
            <p className="text-xs text-slate-600 text-center">{closed.length - 10} more closed cycles</p>
          )}
        </>
      )}
    </>
  );
}

const statusConfig: Record<string, { label: string; color: string }> = {
  csp_open:  { label: "CSP Open",  color: "text-rose-400 bg-rose-400/15" },
  assigned:  { label: "Assigned",  color: "text-amber-400 bg-amber-400/15" },
  cc_open:   { label: "CC Open",   color: "text-violet-400 bg-violet-400/15" },
  closed:    { label: "Closed",    color: "text-slate-400 bg-slate-700/40" },
};

const legIcon: Record<string, string> = {
  SELL_PUT:   "↓P",
  BUY_PUT:    "↑P",
  BUY_STOCK:  "↓S",
  SELL_CALL:  "↓C",
  BUY_CALL:   "↑C",
  SELL_STOCK: "↑S",
};

function WheelCard({ cycle: c }: { cycle: WheelCycle }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[c.status] ?? statusConfig.closed;
  const net = c.status === "closed" ? c.netPnL : c.totalPremiumCollected - c.totalCostToClose;
  const isProfit = net >= 0;

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full p-3.5 flex items-start justify-between gap-2 text-left"
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white">{c.symbol}</span>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
            {c.openStrike && (
              <span className="text-xs text-slate-400">
                ${c.openStrike} {c.openType} {c.openExpiry}
              </span>
            )}
          </div>
          <div className="flex gap-3 text-xs text-slate-500">
            <span>Started {c.startDate.slice(0, 10)}</span>
            <span>{c.legs.length} leg{c.legs.length !== 1 ? "s" : ""}</span>
            {c.sharesHeld > 0 && <span className="text-sky-400">{c.sharesHeld} shares @ ${c.avgStockCost?.toFixed(2)}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-bold text-sm ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
            {isProfit ? "+" : ""}${Math.abs(net).toFixed(2)}
          </div>
          <div className="text-xs text-slate-600">{c.status === "closed" ? "realized" : "net so far"}</div>
          <div className="text-slate-600 text-xs mt-0.5">{expanded ? "▲" : "▼"}</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/60 px-3.5 pb-3.5 pt-2.5 flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1 text-center mb-1">
            <MiniStat label="Collected" value={`+$${c.totalPremiumCollected.toFixed(2)}`} color="text-emerald-400" />
            <MiniStat label="Paid" value={`-$${c.totalCostToClose.toFixed(2)}`} color="text-rose-400" />
            <MiniStat label="Net" value={`${isProfit ? "+" : ""}$${Math.abs(net).toFixed(2)}`} color={isProfit ? "text-emerald-400" : "text-rose-400"} />
          </div>
          {c.legs.map((leg, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold px-1 rounded text-xs ${leg.netCash >= 0 ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"}`}>
                  {legIcon[leg.legType] ?? leg.legType}
                </span>
                <span className="text-slate-400 truncate max-w-[160px]">{leg.description}</span>
              </div>
              <span className={leg.netCash >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {leg.netCash >= 0 ? "+" : ""}${leg.netCash.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trades tab ───────────────────────────────────────────────────────────────

function TradesTab({ trades }: { trades: IBKRTrade[] }) {
  const sorted = [...trades].reverse(); // most recent first
  return (
    <>
      {sorted.length === 0 && <p className="text-slate-500 text-sm text-center mt-6">No trades found in Flex data.</p>}
      <div className="flex flex-col gap-2">
        {sorted.map((t, i) => (
          <div key={t.id || i} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-white text-sm">{t.symbol}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  t.buySell === "SELL"
                    ? "text-emerald-300 bg-emerald-400/15"
                    : "text-rose-300 bg-rose-400/15"
                }`}>{t.buySell}</span>
                {t.assetCategory === "OPT" && (
                  <span className={`text-xs px-1 rounded ${t.putCall === "P" ? "text-rose-400 bg-rose-400/10" : "text-violet-400 bg-violet-400/10"}`}>
                    {t.putCall === "P" ? "PUT" : "CALL"}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500 truncate">
                {t.assetCategory === "OPT"
                  ? `$${t.strike} ${t.expiry} × ${t.quantity}`
                  : `${t.quantity} shares @ $${t.tradePrice.toFixed(2)}`}
              </span>
              <span className="text-xs text-slate-600">{t.dateTime.slice(0, 10)}</span>
            </div>
            <div className="shrink-0 text-right">
              <div className={`font-semibold text-sm ${t.netCash >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {t.netCash >= 0 ? "+" : ""}${Math.abs(t.netCash).toFixed(2)}
              </div>
              <div className="text-xs text-slate-600">net</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── P&L tab ──────────────────────────────────────────────────────────────────

function PnLTab({ monthlyIncome, tickerPnL }: { monthlyIncome: MonthlyIncome[]; tickerPnL: TickerPnL[] }) {
  const totalCollected = monthlyIncome.reduce((s, m) => s + m.premiumCollected, 0);
  const totalPaid = monthlyIncome.reduce((s, m) => s + m.premiumPaid, 0);
  const totalNet = totalCollected - totalPaid;
  const maxMonthly = Math.max(...monthlyIncome.map(m => Math.abs(m.netIncome)), 1);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <StatBox label="Total Collected" value={`$${totalCollected.toFixed(0)}`} color="text-emerald-400" />
        <StatBox label="Total Paid" value={`$${totalPaid.toFixed(0)}`} color="text-rose-400" />
        <StatBox label="Net" value={`${totalNet >= 0 ? "+" : ""}$${totalNet.toFixed(0)}`} color={totalNet >= 0 ? "text-emerald-400" : "text-rose-400"} />
      </div>

      {/* Monthly bar chart */}
      {monthlyIncome.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Monthly Net Income</h3>
          <div className="flex items-end gap-1 h-20">
            {monthlyIncome.slice(-12).map(m => {
              const pct = Math.abs(m.netIncome) / maxMonthly;
              const isPos = m.netIncome >= 0;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex-1 flex items-end w-full">
                    <div
                      className={`w-full rounded-t-sm ${isPos ? "bg-emerald-500" : "bg-rose-500"}`}
                      style={{ height: `${Math.max(pct * 100, 4)}%` }}
                    />
                  </div>
                  <span className="text-slate-600" style={{ fontSize: "8px" }}>{m.label.slice(0, 3)}</span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-1 text-center border-t border-slate-700/40 pt-2">
            {monthlyIncome.slice(-3).reverse().map(m => (
              <div key={m.month}>
                <p className="text-slate-500 text-xs">{m.label}</p>
                <p className={`font-semibold text-xs ${m.netIncome >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {m.netIncome >= 0 ? "+" : ""}${m.netIncome.toFixed(0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-ticker */}
      {tickerPnL.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Per Ticker</h3>
          {tickerPnL.map(t => (
            <div key={t.symbol} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{t.symbol}</span>
                  {t.cycleCount > 0 && (
                    <span className="text-xs text-slate-500">{t.winCount}/{t.cycleCount} wins</span>
                  )}
                </div>
                <span className="text-xs text-slate-500">{t.tradeCount} trades · ${t.totalCollected.toFixed(0)} collected</span>
              </div>
              <div className={`font-bold text-sm ${t.netRealized >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {t.netRealized >= 0 ? "+" : ""}${t.netRealized.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-slate-500 text-xs">{label}</p>
      <p className={`font-semibold text-xs ${color}`}>{value}</p>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-2.5 text-center">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className={`font-bold text-sm ${color}`}>{value}</p>
    </div>
  );
}
