import type { PortfolioSuggestion, RiskSettings } from "../types";
import { computeMaxContracts } from "../engine/portfolio";

interface Props {
  suggestion: PortfolioSuggestion;
  risk: RiskSettings;
  hasScanned: boolean;
  onScan: () => void;
}

export function PortfolioBuilder({ suggestion, risk, hasScanned, onScan }: Props) {
  const { picks, totalCollateral, monthlyIncome, annualizedReturn, targetMonthlyIncome } = suggestion;
  const incomeVsTarget = targetMonthlyIncome > 0 ? (monthlyIncome / targetMonthlyIncome) * 100 : 0;
  const collateralUsedPct = risk.portfolioSize > 0 ? (totalCollateral / risk.portfolioSize) * 100 : 0;

  if (!hasScanned) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">📊</div>
        <div>
          <p className="text-slate-200 font-semibold">No scan data yet</p>
          <p className="text-slate-500 text-sm mt-1">Run a scan first, then come back here for a portfolio recommendation.</p>
          <button
            onClick={onScan}
            className="mt-4 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-medium rounded-xl text-sm transition-colors"
          >
            Scan Now
          </button>
        </div>
      </div>
    );
  }

  if (picks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-4xl">🔍</div>
        <div>
          <p className="text-slate-200 font-semibold">No qualifying picks</p>
          <p className="text-slate-500 text-sm mt-1">Try widening your filters or adding more tickers to the watchlist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>

      {/* Summary card */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Recommended Portfolio</h2>
          <span className="text-xs text-slate-500">{picks.length} positions</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <StatBox
            label="Monthly Income"
            value={`$${monthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            sub={`${incomeVsTarget.toFixed(0)}% of 3% target`}
            color={incomeVsTarget >= 100 ? "text-emerald-400" : incomeVsTarget >= 70 ? "text-amber-400" : "text-rose-400"}
          />
          <StatBox
            label="Collateral Used"
            value={`$${(totalCollateral / 1000).toFixed(0)}k`}
            sub={`${collateralUsedPct.toFixed(0)}% of portfolio`}
            color="text-sky-400"
          />
          <StatBox
            label="Ann. Return"
            value={`${annualizedReturn.toFixed(1)}%`}
            sub="on collateral"
            color={annualizedReturn >= 30 ? "text-emerald-400" : "text-amber-400"}
          />
        </div>

        {/* Income progress bar */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>vs 3% monthly target (${targetMonthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
            <span className={incomeVsTarget >= 100 ? "text-emerald-400" : "text-amber-400"}>
              {incomeVsTarget.toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${incomeVsTarget >= 100 ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${Math.min(incomeVsTarget, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Picks list */}
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide -mb-1">Picks (1 per ticker)</h3>
      {picks.map((opt, i) => {
        const maxContracts = computeMaxContracts(opt.contract.strike, risk);
        const collateral = opt.contract.strike * 100 * maxContracts;
        const monthlyPremium = opt.contract.mid * 100 * maxContracts * (30 / Math.max(opt.contract.dte, 1));
        const signalColor = opt.signal === "STRONG" ? "text-emerald-400" : "text-sky-400";
        const typeBadge = opt.contract.type === "put"
          ? "text-rose-300 bg-rose-500/15"
          : "text-violet-300 bg-violet-500/15";

        return (
          <div key={`${opt.symbol}-${i}`}
            className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 flex flex-col gap-2.5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{opt.symbol}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${typeBadge}`}>
                  {opt.contract.type.toUpperCase()}
                </span>
                <span className="text-slate-500 text-xs">${opt.price.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${signalColor}`}>{opt.signal}</span>
                <span className="text-slate-600 text-xs">Score {opt.score}</span>
              </div>
            </div>

            {/* Core metrics */}
            <div className="grid grid-cols-4 gap-1 text-center">
              <Metric label="Strike" value={`$${opt.contract.strike}`} />
              <Metric label="Expiry" value={opt.contract.expiry} />
              <Metric label="Delta" value={opt.contract.delta.toFixed(2)} />
              <Metric label="IV Rank" value={`${opt.ivRank}%`} />
            </div>

            {/* Sizing row */}
            <div className="grid grid-cols-3 gap-1 text-center bg-slate-900/60 rounded-lg p-2">
              <Metric label={`Max Contracts (${risk.maxRiskPct}%)`} value={String(maxContracts)} highlight />
              <Metric label="Collateral" value={`$${collateral.toLocaleString()}`} highlight />
              <Metric label="Est. Monthly" value={`$${monthlyPremium.toFixed(0)}`} highlight />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`font-bold text-base ${color}`}>{value}</span>
      <span className="text-slate-600 text-xs">{sub}</span>
    </div>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-500" style={{ fontSize: "10px" }}>{label}</span>
      <span className={`font-semibold text-xs ${highlight ? "text-sky-300" : "text-slate-200"}`}>{value}</span>
    </div>
  );
}
