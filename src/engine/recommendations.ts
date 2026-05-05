import type { IBKRPosition, Action, ActionType, ActionUrgency, ScoredOption, RiskSettings } from "../types";
import { getActionablePositions } from "./classifier";

const TODAY = new Date();

function dte(expiry: string): number {
  const exp = new Date(expiry + "T23:59:59");
  return Math.max(0, Math.round((exp.getTime() - TODAY.getTime()) / 86_400_000));
}

function fmt(n: number, prefix = "$"): string {
  return `${prefix}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Core recommendation engine ───────────────────────────────────────────────
//
// Only generates actions for:
//   - Cash-Secured Puts (CSPs)
//   - Covered Calls (CCs)
// Other strategies (risk reversals, spreads, LEAPs) are left untouched.
//
// Priority order:
//   1. URGENT  — positions at ≥ 50% max loss (roll or take loss)
//   2. MANAGE  — positions at ≥ 50% max profit (close or roll winner)
//   3. MANAGE  — DTE < 21 and still open (roll to next cycle)
//   4. OPPORTUNITY — long stock with no paired CC (sell covered call)
//   5. OPPORTUNITY — new CSP suggestions from scanner

export function generateActions(
  positions: IBKRPosition[],
  scanPuts: ScoredOption[],
  scanCalls: ScoredOption[],
  risk: RiskSettings
): Action[] {
  const actions: Action[] = [];

  // Only process CSPs and Covered Calls — leave spreads/reversals/LEAPs alone
  const actionableOpts = getActionablePositions(positions);
  const shortOpts = actionableOpts.filter(p => p.assetCategory === "OPT" && p.quantity < 0);

  const longStocks = positions.filter(p => p.assetCategory === "STK" && p.quantity > 0);
  const openCallSymbols = new Set(
    actionableOpts.filter(p => p.putCall === "C").map(p => p.symbol)
  );

  for (const pos of shortOpts) {
    if (!pos.costBasisPrice || !pos.markPrice || !pos.expiry) continue;

    const mult = pos.multiplier ?? 100;
    const absQty = Math.abs(pos.quantity);
    // For short options: costBasisPrice = credit received per share when opened
    const maxPremium = pos.costBasisPrice * absQty * mult;
    const pnl = pos.unrealizedPnL; // positive = profit (option lost value)
    const pnlPct = maxPremium > 0 ? (pnl / maxPremium) * 100 : 0;
    const daysLeft = dte(pos.expiry);
    const typeLabel = pos.putCall === "P" ? "Put" : "Call";
    const id = `${pos.symbol}-${pos.putCall}-${pos.strike}-${pos.expiry}`;

    // 1. Urgent: loss ≥ 50% of max premium
    if (pnlPct <= -50) {
      const lossAmt = Math.abs(pnl);
      const rollOrStop: ActionType = daysLeft > 5 ? "ROLL_LOSER" : "TAKE_LOSS";
      const urgency: ActionUrgency = pnlPct <= -100 ? "urgent" : "manage";
      actions.push({
        id,
        type: rollOrStop,
        urgency,
        symbol: pos.symbol,
        headline: rollOrStop === "ROLL_LOSER"
          ? `Roll ${typeLabel} — ${Math.abs(pnlPct).toFixed(0)}% loss`
          : `Take loss — ${Math.abs(pnlPct).toFixed(0)}% against you`,
        detail: `${fmt(pos.costBasisPrice)} → ${fmt(pos.markPrice)} | ${daysLeft}d left | Down ${fmt(lossAmt)}`,
        pnlDollars: pnl,
        pnlPct,
        dte: daysLeft,
        position: pos,
      });
      continue;
    }

    // 2. Manage: profit ≥ 50% — close or roll winner
    if (pnlPct >= 50) {
      const type: ActionType = daysLeft <= 21 ? "CLOSE_PROFIT" : "ROLL_WINNER";
      actions.push({
        id,
        type,
        urgency: "manage",
        symbol: pos.symbol,
        headline: type === "CLOSE_PROFIT"
          ? `Close for profit — ${pnlPct.toFixed(0)}% gain`
          : `Roll winner — ${pnlPct.toFixed(0)}% profit, ${daysLeft}d left`,
        detail: `${fmt(pos.costBasisPrice)} → ${fmt(pos.markPrice)} | Buy back ${fmt(pos.markPrice * absQty * mult)} | Lock in ${fmt(pnl)}`,
        pnlDollars: pnl,
        pnlPct,
        dte: daysLeft,
        position: pos,
      });
      continue;
    }

    // 3. Manage: DTE < 21, not yet at 50% profit — roll to next expiry
    if (daysLeft < 21 && daysLeft > 0) {
      actions.push({
        id,
        type: "ROLL_WINNER",
        urgency: "manage",
        symbol: pos.symbol,
        headline: `Roll — ${daysLeft}d to expiry`,
        detail: `${fmt(pos.costBasisPrice)} → ${fmt(pos.markPrice)} | ${pnlPct.toFixed(0)}% of max profit | Roll to 30–45 DTE`,
        pnlDollars: pnl,
        pnlPct,
        dte: daysLeft,
        position: pos,
      });
    }
  }

  // 4. Opportunity: long stock, no CC
  for (const pos of longStocks) {
    if (openCallSymbols.has(pos.symbol)) continue;
    const bestCall = scanCalls.find(s => s.symbol === pos.symbol && s.signal !== "SKIP");
    actions.push({
      id: `cc-${pos.symbol}`,
      type: "SELL_CALL",
      urgency: "opportunity",
      symbol: pos.symbol,
      headline: `Sell Covered Call — ${pos.quantity} shares uncovered`,
      detail: bestCall
        ? `Best: $${bestCall.contract.strike} ${bestCall.contract.expiry} | ${fmt(bestCall.contract.mid)}/share | ${bestCall.annualizedReturn.toFixed(0)}% ann.`
        : `Run a scan to find the best strike`,
      position: pos,
      scanPick: bestCall,
    });
  }

  // 5. Opportunity: new CSP from scanner
  const maxCollateral = (risk.portfolioSize * risk.maxRiskPct) / 100;
  const activeSymbols = new Set(shortOpts.map(p => p.symbol));
  const topPuts = scanPuts
    .filter(s => s.signal !== "SKIP" && !activeSymbols.has(s.symbol))
    .slice(0, 5);

  for (const pick of topPuts) {
    const collateral = pick.contract.strike * 100;
    if (collateral > maxCollateral * 3) continue;
    actions.push({
      id: `csp-${pick.symbol}-${pick.contract.strike}-${pick.contract.expiry}`,
      type: "SELL_PUT",
      urgency: "opportunity",
      symbol: pick.symbol,
      headline: `Sell Put — ${pick.signal} signal (score ${pick.score})`,
      detail: `$${pick.contract.strike} ${pick.contract.expiry} | ${fmt(pick.contract.mid)}/share | IV Rank ${pick.ivRank}% | ${pick.annualizedReturn.toFixed(0)}% ann.`,
      scanPick: pick,
    });
  }

  // Sort: urgent → manage → opportunity, then by urgency within group
  const urgencyOrder: Record<ActionUrgency, number> = { urgent: 0, manage: 1, opportunity: 2 };
  actions.sort((a, b) => {
    const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (uDiff !== 0) return uDiff;
    // Within urgent/manage: sort by worst P&L first
    if (a.pnlPct !== undefined && b.pnlPct !== undefined) return a.pnlPct - b.pnlPct;
    return 0;
  });

  return actions;
}
