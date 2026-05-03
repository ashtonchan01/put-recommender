export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface OptionContract {
  type: "call" | "put";
  strike: number;
  expiry: string; // YYYY-MM-DD
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  volume: number;
  openInterest: number;
  iv: number;
  delta: number;
  theta: number;
}

export interface IVData {
  currentIV: number;
  ivHigh52w: number;
  ivLow52w: number;
  ivRank: number;
  ivPercentile: number;
}

export interface EarningsInfo {
  daysToEarnings: number | null;
  earningsDate: string | null;
}

export interface ScoredOption {
  symbol: string;
  price: number;
  contract: OptionContract;
  ivRank: number;
  annualizedReturn: number;
  score: number;
  earningsWarning: boolean;
  signal: "STRONG" | "OK" | "SKIP";
}

export interface Filters {
  deltaMin: number;
  deltaMax: number;
  dteMin: number;
  dteMax: number;
  minAnnualizedReturn: number;
  minMid: number;
}

export const DEFAULT_FILTERS: Filters = {
  deltaMin: 0.05,
  deltaMax: 0.35,
  dteMin: 2,
  dteMax: 45,
  minAnnualizedReturn: 30,
  minMid: 0.10,
};

export type OptionType = "puts" | "calls" | "all";

export interface RiskSettings {
  portfolioSize: number;
  maxRiskPct: number;
  targetPositions: number;
}

export const DEFAULT_RISK: RiskSettings = {
  portfolioSize: 200000,
  maxRiskPct: 1,
  targetPositions: 10,
};

export interface PortfolioSuggestion {
  picks: ScoredOption[];
  totalCollateral: number;
  monthlyIncome: number;
  annualizedReturn: number;
  targetMonthlyIncome: number;
}

export interface IBKRConfig {
  token: string;
  queryId: string;
  proxyUrl: string;
}

// ── IBKR Position (from Flex OpenPosition) ──────────────────────────────────

export interface IBKRPosition {
  symbol: string;
  description: string;
  assetCategory: "OPT" | "STK" | string;
  quantity: number;          // negative = short
  currentValue: number;      // positionValue (mark * qty * multiplier)
  unrealizedPnL: number;     // fifoPnlUnrealized
  putCall?: "P" | "C";
  strike?: number;
  expiry?: string;           // YYYY-MM-DD
  markPrice?: number;
  costBasisPrice?: number;   // credit received (for short options)
  multiplier?: number;
}

// ── IBKR Trade (from Flex Trades section) ───────────────────────────────────

export interface IBKRTrade {
  id: string;                // transactionID
  dateTime: string;          // ISO: "2026-04-20T09:35:00"
  symbol: string;            // underlying, e.g. "TSLA"
  description: string;
  assetCategory: "OPT" | "STK" | string;
  putCall?: "P" | "C";
  strike?: number;
  expiry?: string;           // YYYY-MM-DD
  multiplier: number;
  buySell: "BUY" | "SELL";
  quantity: number;          // always positive magnitude
  tradePrice: number;
  proceeds: number;          // positive = received cash, negative = paid cash
  commission: number;        // always negative
  netCash: number;           // proceeds + commission
  openClose: "O" | "C" | "O;C";
}

// ── Wheel cycle ──────────────────────────────────────────────────────────────

export type WheelStatus =
  | "csp_open"      // short put open
  | "assigned"      // stock assigned, no CC yet
  | "cc_open"       // short call open on assigned stock
  | "closed";       // full cycle complete

export interface WheelLeg {
  tradeId: string;
  dateTime: string;
  legType: "SELL_PUT" | "BUY_PUT" | "BUY_STOCK" | "SELL_CALL" | "BUY_CALL" | "SELL_STOCK";
  description: string;
  quantity: number;
  price: number;
  netCash: number;   // signed: positive = received, negative = paid
}

export interface WheelCycle {
  id: string;
  symbol: string;
  status: WheelStatus;
  startDate: string;
  endDate?: string;
  legs: WheelLeg[];
  totalPremiumCollected: number;   // sum of all credits received
  totalCostToClose: number;        // sum of all debits paid to close legs
  netPnL: number;                  // realized only (closed legs)
  sharesHeld: number;
  avgStockCost?: number;
  // current open option leg (if any)
  openStrike?: number;
  openExpiry?: string;
  openType?: "PUT" | "CALL";
  openQty?: number;
}

// ── Action recommendations ───────────────────────────────────────────────────

export type ActionType =
  | "CLOSE_PROFIT"    // close at ≥50% profit — lock it in
  | "ROLL_WINNER"     // DTE < 21, profitable — roll to next expiry
  | "ROLL_LOSER"      // at 50% max loss — roll down/out to recover
  | "TAKE_LOSS"       // stop loss — rolling no longer viable
  | "SELL_CALL"       // stock assigned with no CC — sell covered call
  | "SELL_PUT";       // unallocated cash — new CSP opportunity

export type ActionUrgency = "urgent" | "manage" | "opportunity";

export interface Action {
  id: string;
  type: ActionType;
  urgency: ActionUrgency;
  symbol: string;
  headline: string;         // e.g. "Close for profit — 52% gain"
  detail: string;           // e.g. "$1.44 → $0.69 | 21 DTE"
  pnlDollars?: number;
  pnlPct?: number;          // % of max premium
  dte?: number;
  position?: IBKRPosition;
  scanPick?: ScoredOption;  // for SELL_PUT / SELL_CALL suggestions
}

// ── Sync state ───────────────────────────────────────────────────────────────

export interface IBKRSyncData {
  positions: IBKRPosition[];
  trades: IBKRTrade[];
  lastSync: string; // ISO timestamp
}
