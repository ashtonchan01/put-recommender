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
  iv: number; // decimal, e.g. 0.45 = 45%
  delta: number;
  theta: number;
}

export interface IVData {
  currentIV: number;
  ivHigh52w: number;
  ivLow52w: number;
  ivRank: number; // 0–100
  ivPercentile: number; // 0–100
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
  annualizedReturn: number; // percent, e.g. 28.5
  score: number; // 0–100 composite
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

export interface IBKRPosition {
  symbol: string;
  description: string;
  assetCategory: string;
  quantity: number;
  currentValue: number;
  unrealizedPnL: number;
  putCall?: string;
  strike?: number;
  expiry?: string;
  markPrice?: number;
  costBasisPrice?: number;
}
