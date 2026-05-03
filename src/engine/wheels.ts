import type { IBKRTrade, WheelCycle, WheelLeg, WheelStatus } from "../types";

// ── Build wheel cycles from trade history ────────────────────────────────────
//
// Algorithm: group all option + stock trades by underlying symbol.
// Walk chronologically, bucket into cycles:
//   SELL PUT (open) → starts a cycle
//   BUY PUT (close) → closes put leg (profit or loss)
//   BUY STOCK → marks assignment
//   SELL CALL (open) → starts CC leg
//   BUY CALL (close) → closes CC leg
//   SELL STOCK → completes the wheel
//
// A new cycle starts whenever there's a SELL PUT with no current open put on that symbol.

export function buildWheelCycles(trades: IBKRTrade[]): WheelCycle[] {
  // Only process option and stock trades
  const relevant = trades.filter(t => t.assetCategory === "OPT" || t.assetCategory === "STK");

  // Group by underlying symbol
  const bySymbol = new Map<string, IBKRTrade[]>();
  for (const t of relevant) {
    const sym = t.symbol;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(t);
  }

  const allCycles: WheelCycle[] = [];

  for (const [symbol, symTrades] of bySymbol) {
    const cycles = buildCyclesForSymbol(symbol, symTrades);
    allCycles.push(...cycles);
  }

  // Sort: open cycles first, then by startDate desc
  return allCycles.sort((a, b) => {
    if (a.status !== "closed" && b.status === "closed") return -1;
    if (a.status === "closed" && b.status !== "closed") return 1;
    return b.startDate.localeCompare(a.startDate);
  });
}

function buildCyclesForSymbol(symbol: string, trades: IBKRTrade[]): WheelCycle[] {
  const cycles: WheelCycle[] = [];
  let current: WheelCycle | null = null;

  // Track open legs: key = "strike-expiry-putCall"
  let openPutKey: string | null = null;
  let openCallKey: string | null = null;
  let sharesHeld = 0;
  let stockCostBasis = 0;

  for (const t of trades) {
    const isOpt = t.assetCategory === "OPT";
    const isStk = t.assetCategory === "STK";
    const optKey = isOpt ? `${t.strike}-${t.expiry}-${t.putCall}` : "";

    if (isOpt && t.putCall === "P" && t.buySell === "SELL") {
      // Starting a new CSP — open new cycle
      if (current && current.status !== "closed") {
        // Previous cycle still open on same symbol — push it as multi-leg
        cycles.push(current);
      }
      current = makeCycle(symbol, t.dateTime);
      current.legs.push(makeLeg(t, "SELL_PUT"));
      current.totalPremiumCollected += t.netCash;
      current.status = "csp_open";
      current.openStrike = t.strike;
      current.openExpiry = t.expiry;
      current.openType = "PUT";
      current.openQty = t.quantity;
      openPutKey = optKey;
    } else if (isOpt && t.putCall === "P" && t.buySell === "BUY" && openPutKey === optKey && current) {
      // Closing the put
      current.legs.push(makeLeg(t, "BUY_PUT"));
      current.totalCostToClose += Math.abs(t.netCash);
      current.netPnL += t.netCash; // buying back is negative cash
      current.netPnL += current.totalPremiumCollected;
      openPutKey = null;
      current.openStrike = undefined;
      current.openExpiry = undefined;
      current.openType = undefined;

      if (sharesHeld === 0) {
        // No stock → cycle complete (closed put for profit or loss)
        current.status = "closed";
        current.endDate = t.dateTime;
        cycles.push(current);
        current = null;
      } else {
        // Still holding stock → back to assigned state
        current.status = "assigned";
      }
    } else if (isStk && t.buySell === "BUY" && current) {
      // Assignment — bought shares
      current.legs.push(makeLeg(t, "BUY_STOCK"));
      sharesHeld += t.quantity;
      stockCostBasis = t.tradePrice;
      current.sharesHeld = sharesHeld;
      current.avgStockCost = stockCostBasis;
      current.status = "assigned";
      current.openStrike = undefined;
      current.openExpiry = undefined;
      openPutKey = null;
    } else if (isOpt && t.putCall === "C" && t.buySell === "SELL" && current) {
      // Selling covered call
      current.legs.push(makeLeg(t, "SELL_CALL"));
      current.totalPremiumCollected += t.netCash;
      current.status = "cc_open";
      current.openStrike = t.strike;
      current.openExpiry = t.expiry;
      current.openType = "CALL";
      current.openQty = t.quantity;
      openCallKey = optKey;
    } else if (isOpt && t.putCall === "C" && t.buySell === "BUY" && openCallKey === optKey && current) {
      // Closing the call
      current.legs.push(makeLeg(t, "BUY_CALL"));
      current.totalCostToClose += Math.abs(t.netCash);
      openCallKey = null;
      current.openStrike = undefined;
      current.openExpiry = undefined;
      current.openType = undefined;
      current.status = sharesHeld > 0 ? "assigned" : "closed";
      if (current.status === "closed") {
        current.endDate = t.dateTime;
        cycles.push(current);
        current = null;
      }
    } else if (isStk && t.buySell === "SELL" && current) {
      // Shares called away (assignment on CC) or manual sell
      current.legs.push(makeLeg(t, "SELL_STOCK"));
      sharesHeld -= t.quantity;
      current.sharesHeld = Math.max(0, sharesHeld);
      if (sharesHeld <= 0) {
        current.status = "closed";
        current.endDate = t.dateTime;
        // Include stock P&L in net
        const stockPnL = (t.tradePrice - (current.avgStockCost ?? t.tradePrice)) * t.quantity;
        current.netPnL += stockPnL + current.totalPremiumCollected - current.totalCostToClose;
        cycles.push(current);
        current = null;
        sharesHeld = 0;
        stockCostBasis = 0;
      }
    }
  }

  // Any still-open cycle gets pushed
  if (current) {
    cycles.push(current);
  }

  return cycles;
}

function makeCycle(symbol: string, startDate: string): WheelCycle {
  return {
    id: `${symbol}-${startDate}-${Math.random().toString(36).slice(2, 6)}`,
    symbol,
    status: "csp_open",
    startDate,
    legs: [],
    totalPremiumCollected: 0,
    totalCostToClose: 0,
    netPnL: 0,
    sharesHeld: 0,
  };
}

function makeLeg(t: IBKRTrade, legType: WheelLeg["legType"]): WheelLeg {
  const desc = t.description || `${t.buySell} ${t.quantity} ${t.symbol}`;
  return {
    tradeId: t.id,
    dateTime: t.dateTime,
    legType,
    description: desc,
    quantity: t.quantity,
    price: t.tradePrice,
    netCash: t.netCash,
  };
}

// ── Per-month income from trades ─────────────────────────────────────────────

export interface MonthlyIncome {
  month: string;       // "2026-04"
  label: string;       // "Apr 2026"
  premiumCollected: number;
  premiumPaid: number;
  netIncome: number;
  tradeCount: number;
}

export function buildMonthlyIncome(trades: IBKRTrade[]): MonthlyIncome[] {
  const map = new Map<string, MonthlyIncome>();

  for (const t of trades) {
    if (t.assetCategory !== "OPT") continue;
    const month = t.dateTime.slice(0, 7); // "2026-04"
    if (!map.has(month)) {
      const [yr, mo] = month.split("-");
      const label = new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString("default", { month: "short", year: "numeric" });
      map.set(month, { month, label, premiumCollected: 0, premiumPaid: 0, netIncome: 0, tradeCount: 0 });
    }
    const entry = map.get(month)!;
    if (t.buySell === "SELL") {
      entry.premiumCollected += t.netCash;
    } else {
      entry.premiumPaid += Math.abs(t.netCash);
    }
    entry.netIncome = entry.premiumCollected - entry.premiumPaid;
    entry.tradeCount++;
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// ── Per-ticker P&L ───────────────────────────────────────────────────────────

export interface TickerPnL {
  symbol: string;
  totalCollected: number;
  totalPaid: number;
  netRealized: number;
  tradeCount: number;
  cycleCount: number;
  winCount: number;
}

export function buildTickerPnL(cycles: WheelCycle[]): TickerPnL[] {
  const map = new Map<string, TickerPnL>();
  for (const c of cycles) {
    if (!map.has(c.symbol)) {
      map.set(c.symbol, { symbol: c.symbol, totalCollected: 0, totalPaid: 0, netRealized: 0, tradeCount: 0, cycleCount: 0, winCount: 0 });
    }
    const t = map.get(c.symbol)!;
    t.totalCollected += c.totalPremiumCollected;
    t.totalPaid += c.totalCostToClose;
    if (c.status === "closed") {
      t.netRealized += c.netPnL;
      t.cycleCount++;
      if (c.netPnL > 0) t.winCount++;
    }
    t.tradeCount += c.legs.length;
  }
  return Array.from(map.values()).sort((a, b) => b.totalCollected - a.totalCollected);
}
