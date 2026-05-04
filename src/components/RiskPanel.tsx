import type { RiskSettings } from "../types";

interface Props {
  risk: RiskSettings;
  onChange: (r: RiskSettings) => void;
}

export function RiskPanel({ risk, onChange }: Props) {
  const set = <K extends keyof RiskSettings>(key: K, value: RiskSettings[K]) =>
    onChange({ ...risk, [key]: value });

  const maxRiskDollars = (risk.portfolioSize * risk.maxRiskPct) / 100;
  const monthlyTarget3pct = risk.portfolioSize * 0.03;
  const monthlyTarget5pct = risk.portfolioSize * 0.05;

  return (
    <div className="glass-card p-4 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-white">Risk Settings</h3>

      {/* Portfolio size */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-neutral-400">
          <span>Portfolio Size</span>
          <span className="text-white font-medium">${risk.portfolioSize.toLocaleString()}</span>
        </div>
        <input
          type="range"
          min={50000} max={1000000} step={10000}
          value={risk.portfolioSize}
          onChange={(e) => set("portfolioSize", Number(e.target.value))}
          className="w-full accent-sky-500 cursor-pointer h-1.5"
        />
        <div className="flex justify-between text-xs text-neutral-600">
          <span>$50k</span>
          <span>$1M</span>
        </div>
      </div>

      {/* Max risk per trade */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-neutral-400">
          <span>Max Risk / Trade</span>
          <span className="text-white font-medium">{risk.maxRiskPct}% = ${maxRiskDollars.toLocaleString()}</span>
        </div>
        <input
          type="range"
          min={0.5} max={3} step={0.5}
          value={risk.maxRiskPct}
          onChange={(e) => set("maxRiskPct", Number(e.target.value))}
          className="w-full accent-emerald-500 cursor-pointer h-1.5"
        />
        <div className="flex justify-between text-xs text-neutral-600">
          <span>0.5%</span>
          <span>3%</span>
        </div>
      </div>

      {/* Target positions */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-neutral-400">
          <span>Target Positions</span>
          <span className="text-white font-medium">{risk.targetPositions}</span>
        </div>
        <input
          type="range"
          min={4} max={16} step={1}
          value={risk.targetPositions}
          onChange={(e) => set("targetPositions", Number(e.target.value))}
          className="w-full accent-violet-500 cursor-pointer h-1.5"
        />
        <div className="flex justify-between text-xs text-neutral-600">
          <span>4</span>
          <span>16</span>
        </div>
      </div>

      {/* Monthly income targets */}
      <div className="border-t border-white/[0.06] pt-3 grid grid-cols-2 gap-2">
        <div className="bg-white/[0.03] rounded-lg p-2.5 text-center">
          <p className="text-neutral-500 text-xs">Conservative target</p>
          <p className="text-emerald-400 font-semibold text-sm">${monthlyTarget3pct.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</p>
          <p className="text-neutral-600 text-xs">3% monthly</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-2.5 text-center">
          <p className="text-neutral-500 text-xs">Stretch target</p>
          <p className="text-amber-400 font-semibold text-sm">${monthlyTarget5pct.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</p>
          <p className="text-neutral-600 text-xs">5% monthly</p>
        </div>
      </div>

      {/* Rules reminder */}
      <div className="border-t border-white/[0.06] pt-3 flex flex-col gap-1.5">
        <p className="text-neutral-500 text-xs font-medium uppercase tracking-wide">Framework Rules</p>
        <Rule icon="✓" text={`Max $${maxRiskDollars.toLocaleString()} collateral per trade`} />
        <Rule icon="✓" text="Sell 0.20–0.30 delta — not too cheap, not too likely" />
        <Rule icon="✓" text="Close winners at 50% profit; losers at 50% max loss" />
        <Rule icon="✓" text="Skip trades when IV Rank < 20 (premium too cheap)" />
        <Rule icon="✓" text="Avoid selling into earnings — gap risk is brutal" />
        <Rule icon="✓" text={`${risk.targetPositions} diversified positions across different tickers`} />
      </div>
    </div>
  );
}

function Rule({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-neutral-400">
      <span className="text-emerald-500 shrink-0 mt-0.5">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
