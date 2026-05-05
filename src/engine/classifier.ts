import type { IBKRPosition } from "../types";

// ── Strategy types ─────────────────────────────────────────────────────────

export type StrategyType =
  | "risk_reversal"   // short put + long call, same underlying, similar expiry
  | "synthetic_long"  // short put + long call at same strike (ATM)
  | "put_spread"      // long put + short put, same underlying, same expiry
  | "call_spread"     // long call + short call, same underlying, same expiry
  | "leap"            // long option, DTE > 365
  | "csp"             // cash-secured put (standalone short put)
  | "covered_call"    // short call with underlying stock held
  | "other";          // anything unclassified

export interface ClassifiedPosition {
  position: IBKRPosition;
  strategy: StrategyType;
  pairedWith?: IBKRPosition; // the other leg if it's a multi-leg strategy
}

export interface StrategyGroup {
  type: StrategyType;
  label: string;
  positions: ClassifiedPosition[];
}

const STRATEGY_LABELS: Record<StrategyType, string> = {
  risk_reversal: "Risk Reversals",
  synthetic_long: "Synthetic Longs",
  put_spread: "Put Spreads",
  call_spread: "Call Spreads",
  leap: "LEAP Options",
  csp: "Cash-Secured Puts",
  covered_call: "Covered Calls",
  other: "Other",
};

// ── Classification algorithm ───────────────────────────────────────────────
//
// Priority:
//   1. Spreads — same underlying, same expiry, same putCall, one long + one short
//   2. Risk Reversals — same underlying, similar expiry (±30d), short put + long call
//   3. Covered Calls — short call where we hold ≥ (100 × contracts) shares
//   4. CSPs — remaining short puts
//   5. LEAPs — long options with DTE > 365
//   6. Other — anything left

export function classifyPositions(positions: IBKRPosition[]): StrategyGroup[] {
  const today = new Date();
  const matched = new Set<number>(); // indices of positions already matched
  const results: ClassifiedPosition[] = [];

  const opts = positions.map((p, i) => ({ pos: p, idx: i })).filter(x => x.pos.assetCategory === "OPT");
  const stocks = positions.filter(p => p.assetCategory === "STK" && p.quantity > 0);

  // Helper: days to expiry
  const dte = (expiry?: string): number => {
    if (!expiry) return 0;
    const exp = new Date(expiry.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") + "T23:59:59");
    return Math.max(0, Math.round((exp.getTime() - today.getTime()) / 86_400_000));
  };

  // Helper: similar expiry (within 30 days)
  const similarExpiry = (a?: string, b?: string): boolean => {
    if (!a || !b) return false;
    return Math.abs(dte(a) - dte(b)) <= 30;
  };

  // Helper: same expiry
  const sameExpiry = (a?: string, b?: string): boolean => a === b;

  // 1. SPREADS — same underlying, same expiry, same putCall, opposing sides
  for (const { pos: a, idx: ai } of opts) {
    if (matched.has(ai)) continue;
    for (const { pos: b, idx: bi } of opts) {
      if (ai === bi || matched.has(bi)) continue;
      if (a.symbol !== b.symbol) continue;
      if (a.putCall !== b.putCall) continue;
      if (!sameExpiry(a.expiry, b.expiry)) continue;
      // One long, one short
      if ((a.quantity > 0 && b.quantity < 0) || (a.quantity < 0 && b.quantity > 0)) {
        const strategy: StrategyType = a.putCall === "P" ? "put_spread" : "call_spread";
        matched.add(ai);
        matched.add(bi);
        results.push({ position: a, strategy, pairedWith: b });
        results.push({ position: b, strategy, pairedWith: a });
        break;
      }
    }
  }

  // 2. RISK REVERSALS — same underlying, similar expiry, short put + long call
  const shortPuts = opts.filter(x => !matched.has(x.idx) && x.pos.putCall === "P" && x.pos.quantity < 0);
  const longCalls = opts.filter(x => !matched.has(x.idx) && x.pos.putCall === "C" && x.pos.quantity > 0);

  for (const sp of shortPuts) {
    if (matched.has(sp.idx)) continue;
    for (const lc of longCalls) {
      if (matched.has(lc.idx)) continue;
      if (sp.pos.symbol !== lc.pos.symbol) continue;
      if (!similarExpiry(sp.pos.expiry, lc.pos.expiry)) continue;
      // Match quantities (take min of matched contracts)
      const matchQty = Math.min(Math.abs(sp.pos.quantity), lc.pos.quantity);
      if (matchQty > 0) {
        // Check if strikes are same (synthetic) or different (risk reversal)
        const isSynthetic = sp.pos.strike === lc.pos.strike;
        const strategy: StrategyType = isSynthetic ? "synthetic_long" : "risk_reversal";
        matched.add(sp.idx);
        matched.add(lc.idx);
        results.push({ position: sp.pos, strategy, pairedWith: lc.pos });
        results.push({ position: lc.pos, strategy, pairedWith: sp.pos });
        break;
      }
    }
  }

  // 3. COVERED CALLS — short call where we hold enough shares
  const stockShares = new Map<string, number>();
  for (const s of stocks) {
    stockShares.set(s.symbol, (stockShares.get(s.symbol) ?? 0) + s.quantity);
  }

  const shortCalls = opts.filter(x => !matched.has(x.idx) && x.pos.putCall === "C" && x.pos.quantity < 0);
  for (const sc of shortCalls) {
    const shares = stockShares.get(sc.pos.symbol) ?? 0;
    const contractsNeeded = Math.abs(sc.pos.quantity) * 100;
    if (shares >= contractsNeeded) {
      matched.add(sc.idx);
      results.push({ position: sc.pos, strategy: "covered_call" });
      // Reduce available shares
      stockShares.set(sc.pos.symbol, shares - contractsNeeded);
    }
  }

  // 4. CSPs — remaining short puts
  const remainingShortPuts = opts.filter(x => !matched.has(x.idx) && x.pos.putCall === "P" && x.pos.quantity < 0);
  for (const sp of remainingShortPuts) {
    matched.add(sp.idx);
    results.push({ position: sp.pos, strategy: "csp" });
  }

  // 5. LEAPs — long options with DTE > 365
  const remainingLong = opts.filter(x => !matched.has(x.idx) && x.pos.quantity > 0);
  for (const l of remainingLong) {
    matched.add(l.idx);
    const d = dte(l.pos.expiry);
    results.push({ position: l.pos, strategy: d > 365 ? "leap" : "other" });
  }

  // 6. Everything else (unmatched short calls without stock, etc.)
  for (const { pos, idx } of opts) {
    if (matched.has(idx)) continue;
    results.push({ position: pos, strategy: "other" });
  }

  // Add stock positions (classified as supporting covered calls or standalone)
  for (const s of stocks) {
    results.push({ position: s, strategy: "other" });
  }

  // Group by strategy
  const groupMap = new Map<StrategyType, ClassifiedPosition[]>();
  for (const r of results) {
    if (!groupMap.has(r.strategy)) groupMap.set(r.strategy, []);
    groupMap.get(r.strategy)!.push(r);
  }

  // Order: CSP, CC, Risk Reversal, Synthetic, Put Spread, Call Spread, LEAP, Other
  const order: StrategyType[] = ["csp", "covered_call", "risk_reversal", "synthetic_long", "put_spread", "call_spread", "leap", "other"];
  const groups: StrategyGroup[] = [];
  for (const type of order) {
    const positions = groupMap.get(type);
    if (positions && positions.length > 0) {
      groups.push({ type, label: STRATEGY_LABELS[type], positions });
    }
  }

  return groups;
}

// Extract only CSP and CC positions for the action engine
export function getActionablePositions(positions: IBKRPosition[]): IBKRPosition[] {
  const groups = classifyPositions(positions);
  const actionable: IBKRPosition[] = [];
  for (const g of groups) {
    if (g.type === "csp" || g.type === "covered_call") {
      actionable.push(...g.positions.map(p => p.position));
    }
  }
  return actionable;
}
