import type { OptionContract, ScoredOption, Filters } from "../types";

export function scoreOptions(
  symbol: string,
  price: number,
  contracts: OptionContract[],
  ivRank: number,
  daysToEarnings: number | null,
  filters: Filters
): ScoredOption[] {
  const targetDeltaAbs = (filters.deltaMin + filters.deltaMax) / 2;

  const candidates = contracts.filter((c) => {
    const absDelta = Math.abs(c.delta);
    return (
      absDelta >= filters.deltaMin &&
      absDelta <= filters.deltaMax &&
      c.dte >= filters.dteMin &&
      c.dte <= filters.dteMax &&
      c.mid >= filters.minMid &&
      c.openInterest > 0
    );
  });

  const scored: ScoredOption[] = [];

  for (const c of candidates) {
    const annualizedReturn = (c.mid / c.strike) * (365 / c.dte) * 100;
    if (annualizedReturn < filters.minAnnualizedReturn) continue;

    // Skip entirely if earnings fall within this contract's expiry window
    if (daysToEarnings != null && daysToEarnings <= c.dte) continue;

    const returnScore = Math.min(annualizedReturn / 80, 1);
    const deltaScore = Math.max(1 - Math.abs(Math.abs(c.delta) - targetDeltaAbs) / 0.15, 0);
    const ivScore = ivRank / 100;
    const dteScore = scoreDTE(c.dte);
    const liquidityScore = Math.min((c.openInterest / 500 + c.volume / 100) / 2, 1);

    const raw =
      returnScore * 0.35 +
      deltaScore * 0.25 +
      ivScore * 0.20 +
      dteScore * 0.10 +
      liquidityScore * 0.10;

    const score = Math.round(raw * 100);
    const signal: ScoredOption["signal"] = score >= 65 ? "STRONG" : score >= 40 ? "OK" : "SKIP";

    scored.push({ symbol, price, contract: c, ivRank, annualizedReturn, score, earningsWarning: false, signal });
  }

  return scored.sort((a, b) => b.score - a.score);
}

function scoreDTE(dte: number): number {
  if (dte >= 21 && dte <= 35) return 1;
  if (dte >= 14 && dte < 21) return 0.6 + ((dte - 14) / 7) * 0.4;
  if (dte > 35 && dte <= 45) return 1 - ((dte - 35) / 10) * 0.4;
  return 0.3;
}
