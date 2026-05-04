import type { IBKRTrade, WheelCycle, WheelLeg } from "../types";

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

// ── Performance stats (Journal Profit View) ─────────────────────────────────

export interface PerformanceStats {
  netPnL: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;           // 0-100
  profitFactor: number;      // gross profit / gross loss
  avgWin: number;
  avgLoss: number;
  avgWinLossRatio: number;
  totalPremiumCollected: number;
  openChains: number;
  closedChains: number;
  chainWinRate: number;      // 0-100
  maxDrawdownPct: number;    // 0-100
}

export function computePerformanceStats(cycles: WheelCycle[], trades: IBKRTrade[]): PerformanceStats {
  // Trade-level win/loss (each closed option trade)
  const optTrades = trades.filter(t => t.assetCategory === "OPT");
  let wins = 0, losses = 0, grossProfit = 0, grossLoss = 0;

  // Pair sells + buys by looking at net cash per trade
  for (const t of optTrades) {
    if (t.netCash > 0) { wins++; grossProfit += t.netCash; }
    else if (t.netCash < 0) { losses++; grossLoss += Math.abs(t.netCash); }
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;

  // Chain-level stats
  const closed = cycles.filter(c => c.status === "closed");
  const open = cycles.filter(c => c.status !== "closed");
  const chainWins = closed.filter(c => c.netPnL > 0).length;
  const chainWinRate = closed.length > 0 ? (chainWins / closed.length) * 100 : 0;

  const totalPremiumCollected = cycles.reduce((s, c) => s + c.totalPremiumCollected, 0);
  const netPnL = optTrades.reduce((s, t) => s + t.netCash, 0);

  // Max drawdown from cumulative P&L
  const daily = buildDailyPnL(trades);
  let peak = 0, maxDD = 0, cum = 0;
  for (const d of daily) {
    cum += d.value;
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? ((peak - cum) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    netPnL,
    totalTrades,
    winCount: wins,
    lossCount: losses,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    avgWinLossRatio: avgLoss > 0 ? avgWin / avgLoss : 0,
    totalPremiumCollected,
    openChains: open.length,
    closedChains: closed.length,
    chainWinRate,
    maxDrawdownPct: maxDD,
  };
}

// ── Daily P&L ───────────────────────────────────────────────────────────────

export interface DailyPnL {
  date: string;     // "2026-04-20"
  label: string;    // "Apr 20"
  value: number;    // net P&L that day
}

export function buildDailyPnL(trades: IBKRTrade[]): DailyPnL[] {
  const map = new Map<string, number>();

  for (const t of trades) {
    if (t.assetCategory !== "OPT") continue;
    const date = t.dateTime.slice(0, 10);
    map.set(date, (map.get(date) ?? 0) + t.netCash);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => {
      const d = new Date(date + "T12:00:00");
      const label = d.toLocaleString("default", { month: "short", day: "numeric" });
      return { date, label, value };
    });
}

// ── Cumulative P&L ──────────────────────────────────────────────────────────

export function buildCumulativePnL(daily: DailyPnL[]): { label: string; value: number }[] {
  let cum = 0;
  return daily.map(d => {
    cum += d.value;
    return { label: d.label, value: cum };
  });
}

// ── Calendar P&L (grouped by month → days) ──────────────────────────────────

export interface CalendarMonth {
  month: string;     // "2026-04"
  label: string;     // "April 2026"
  days: { date: string; dayOfMonth: number; pnl: number; weekday: number }[];
  firstWeekday: number; // 0=Sun, 1=Mon...
  totalDays: number;
  monthPnL: number;
}

export function buildCalendarData(trades: IBKRTrade[]): CalendarMonth[] {
  const dayMap = new Map<string, number>();
  for (const t of trades) {
    if (t.assetCategory !== "OPT") continue;
    const date = t.dateTime.slice(0, 10);
    dayMap.set(date, (dayMap.get(date) ?? 0) + t.netCash);
  }

  const monthMap = new Map<string, CalendarMonth>();
  for (const [date, pnl] of dayMap) {
    const month = date.slice(0, 7);
    if (!monthMap.has(month)) {
      const d = new Date(date + "T12:00:00");
      const label = d.toLocaleString("default", { month: "long", year: "numeric" });
      const firstDay = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)) - 1, 1);
      const lastDay = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0);
      monthMap.set(month, {
        month,
        label,
        days: [],
        firstWeekday: firstDay.getDay(),
        totalDays: lastDay.getDate(),
        monthPnL: 0,
      });
    }
    const entry = monthMap.get(month)!;
    const d = new Date(date + "T12:00:00");
    entry.days.push({
      date,
      dayOfMonth: d.getDate(),
      pnl,
      weekday: d.getDay(),
    });
    entry.monthPnL += pnl;
  }

  return Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month));
}
