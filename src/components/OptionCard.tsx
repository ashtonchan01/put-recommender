import type { ScoredOption, RiskSettings } from "../types";
import { computeMaxContracts } from "../engine/portfolio";

interface Props {
  option: ScoredOption;
  risk: RiskSettings;
}

const signalStyle = {
  STRONG: "border-emerald-500/40 bg-emerald-400/5",
  OK: "border-sky-500/40 bg-sky-400/5",
  SKIP: "border-neutral-600/40 bg-neutral-800/40",
};

const signalBadge = {
  STRONG: "text-emerald-400 bg-emerald-400/15 border-emerald-500/30",
  OK: "text-sky-400 bg-sky-400/15 border-sky-500/30",
  SKIP: "text-neutral-400 bg-neutral-700/40 border-neutral-600/30",
};

const typeBadge = {
  call: "text-violet-300 bg-violet-500/15",
  put: "text-rose-300 bg-rose-500/15",
};

export function OptionCard({ option, risk }: Props) {
  const { symbol, price, contract: c, ivRank, annualizedReturn, score, earningsWarning, signal } = option;
  const maxContracts = computeMaxContracts(c.strike, risk);
  const collateralPerContract = c.strike * 100;
  const monthlyEstimate = c.mid * 100 * (30 / Math.max(c.dte, 1));

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${signalStyle[signal]}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-bold text-white">{symbol}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeBadge[c.type]}`}>
            {c.type.toUpperCase()}
          </span>
          <span className="text-sm text-neutral-400">${price.toFixed(2)}</span>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${signalBadge[signal]}`}>
            {signal}
          </span>
          <span className="text-xs text-neutral-500">Score {score}</span>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Strike" value={`$${c.strike}`} large />
        <Metric label="Premium" value={`$${c.mid.toFixed(2)}`} large />
        <Metric label="Ann. Return" value={`${annualizedReturn.toFixed(1)}%`} large />
      </div>

      {/* Detail row */}
      <div className="grid grid-cols-4 gap-1 text-center border-t border-white/5 pt-3">
        <Metric label="Expiry" value={c.expiry} />
        <Metric label="DTE" value={String(c.dte)} />
        <Metric label="Delta" value={c.delta.toFixed(2)} />
        <Metric label="IV Rank" value={`${ivRank}%`} />
      </div>

      {/* Position sizing */}
      <div className="grid grid-cols-3 gap-1 text-center bg-neutral-900/40 rounded-lg p-2 border-t border-white/5">
        <Metric label={`Max @ ${risk.maxRiskPct}% risk`} value={`${maxContracts} contract${maxContracts !== 1 ? "s" : ""}`} />
        <Metric label="Collateral/contract" value={`$${collateralPerContract.toLocaleString()}`} />
        <Metric label="Est. monthly (1 ct)" value={`$${monthlyEstimate.toFixed(0)}`} />
      </div>

      {/* Liquidity */}
      <div className="flex justify-between text-xs text-neutral-500 border-t border-white/5 pt-2">
        <span>Vol {c.volume.toLocaleString()}</span>
        <span>OI {c.openInterest.toLocaleString()}</span>
        <span>IV {(c.iv * 100).toFixed(0)}%</span>
        <span>θ ${c.theta.toFixed(2)}/d</span>
      </div>

      {earningsWarning && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-1.5">
          <span>⚠</span>
          <span>Earnings within expiry — elevated assignment/gap risk</span>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-neutral-500" style={{ fontSize: "10px" }}>{label}</span>
      <span className={`font-semibold ${large ? "text-white text-base" : "text-neutral-200 text-xs"}`}>
        {value}
      </span>
    </div>
  );
}
