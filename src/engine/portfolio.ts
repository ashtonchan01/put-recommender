import type { ScoredOption, RiskSettings, PortfolioSuggestion } from "../types";

export function buildPortfolio(
  puts: ScoredOption[],
  calls: ScoredOption[],
  riskSettings: RiskSettings
): PortfolioSuggestion {
  const maxCollateralPerTrade = (riskSettings.portfolioSize * riskSettings.maxRiskPct) / 100;
  const usedTickers = new Set<string>();
  const picks: ScoredOption[] = [];

  // Prefer puts for the wheel; fill remaining slots with calls
  const candidates = [
    ...puts.filter(o => o.signal !== "SKIP"),
    ...calls.filter(o => o.signal !== "SKIP"),
  ].sort((a, b) => b.score - a.score);

  for (const opt of candidates) {
    if (picks.length >= riskSettings.targetPositions) break;
    if (usedTickers.has(opt.symbol)) continue;

    const collateral = opt.contract.strike * 100;
    // Skip if a single contract requires more than 3× the per-trade limit
    if (collateral > maxCollateralPerTrade * 3) continue;

    usedTickers.add(opt.symbol);
    picks.push(opt);
  }

  const totalCollateral = picks.reduce((sum, o) => sum + o.contract.strike * 100, 0);

  // Monthly income: scale premium to 30-day equivalent
  const monthlyIncome = picks.reduce((sum, o) => {
    const premiumPerContract = o.contract.mid * 100;
    const daysToExpiry = Math.max(o.contract.dte, 1);
    return sum + premiumPerContract * (30 / daysToExpiry);
  }, 0);

  const annualizedReturn = totalCollateral > 0
    ? (monthlyIncome * 12 / totalCollateral) * 100
    : 0;

  // Target: 3% monthly on deployed collateral (conservative wheel target)
  const targetMonthlyIncome = totalCollateral * 0.03;

  return { picks, totalCollateral, monthlyIncome, annualizedReturn, targetMonthlyIncome };
}

export function computeMaxContracts(
  strikePrice: number,
  riskSettings: RiskSettings
): number {
  const maxCollateralPerTrade = (riskSettings.portfolioSize * riskSettings.maxRiskPct) / 100;
  const collateralPerContract = strikePrice * 100;
  return Math.max(1, Math.floor(maxCollateralPerTrade / collateralPerContract));
}
