import type { StockQuote, OptionContract, IVData, EarningsInfo } from "../types";

const YAHOO_PROXY = import.meta.env.DEV
  ? "/yahoo-api"
  : (localStorage.getItem("wheel-yahoo-proxy") ?? "https://cc-yahoo-proxy.ashtonchan.workers.dev");

async function fetchYahoo(path: string, retries = 2): Promise<unknown> {
  const url = `${YAHOO_PROXY}${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`Yahoo API ${res.status}`);
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

export async function getQuote(symbol: string): Promise<StockQuote> {
  const data = await fetchYahoo(`/v8/finance/chart/${symbol}?interval=1d&range=1d`) as {
    chart: { result: Array<{ meta: { regularMarketPrice: number; chartPreviousClose?: number; previousClose?: number } }> };
  };
  const meta = data.chart.result[0].meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = price - prevClose;
  return {
    symbol,
    price,
    change,
    changePercent: prevClose ? (change / prevClose) * 100 : 0,
  };
}

export async function getOptions(symbol: string): Promise<{ calls: OptionContract[]; puts: OptionContract[]; price: number }> {
  const initData = await fetchYahoo(`/v7/finance/options/${symbol}`) as {
    optionChain: { result: Array<{ expirationDates: number[]; quote: { regularMarketPrice: number } }> };
  };
  const result = initData.optionChain.result[0];
  const expirations: number[] = result.expirationDates ?? [];
  const currentPrice = result.quote.regularMarketPrice;

  const now = Math.floor(Date.now() / 1000);
  const targetExps = expirations
    .filter((exp) => {
      const dte = (exp - now) / 86400;
      return dte >= 5 && dte <= 55;
    })
    .slice(0, 6);

  const chains = await Promise.all(
    targetExps.map(async (exp) => {
      try {
        const d = await fetchYahoo(`/v7/finance/options/${symbol}?date=${exp}`) as {
          optionChain: { result: Array<{ options: Array<{ calls: RawOption[]; puts: RawOption[]; expirationDate: number }> }> };
        };
        return d.optionChain.result[0].options[0];
      } catch {
        return null;
      }
    })
  );

  const calls: OptionContract[] = [];
  const puts: OptionContract[] = [];

  for (const chain of chains) {
    if (!chain) continue;
    const expDate = new Date(chain.expirationDate * 1000).toISOString().split("T")[0];
    const dte = Math.round((chain.expirationDate - now) / 86400);

    for (const c of chain.calls ?? []) {
      if (!c.strike || Math.abs(c.strike - currentPrice) / currentPrice > 0.25) continue;
      calls.push(parseContract(c, expDate, dte, currentPrice, "call"));
    }
    for (const p of chain.puts ?? []) {
      if (!p.strike || Math.abs(p.strike - currentPrice) / currentPrice > 0.25) continue;
      puts.push(parseContract(p, expDate, dte, currentPrice, "put"));
    }
  }

  return { calls, puts, price: currentPrice };
}

interface RawOption {
  strike?: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  impliedVolatility?: number;
  volume?: number;
  openInterest?: number;
}

function parseContract(
  raw: RawOption,
  expiry: string,
  dte: number,
  spotPrice: number,
  type: "call" | "put"
): OptionContract {
  const bid = raw.bid ?? 0;
  const ask = raw.ask ?? 0;
  const lastPrice = raw.lastPrice ?? 0;
  const strike = raw.strike ?? 0;
  const T = Math.max(dte, 0.5) / 365;
  const mid = (bid + ask) / 2 || lastPrice;

  let iv = raw.impliedVolatility ?? 0;
  if (iv < 0.05 && mid > 0) iv = estimateIV(spotPrice, strike, T, mid, type);
  if (iv < 0.10) iv = 0.30;

  const greeks = bsGreeks(spotPrice, strike, T, iv, type);

  return {
    type,
    strike,
    expiry,
    dte,
    bid: bid || lastPrice,
    ask: ask || lastPrice,
    mid,
    volume: raw.volume ?? 0,
    openInterest: raw.openInterest ?? 0,
    iv,
    delta: greeks.delta,
    theta: greeks.theta,
  };
}

export async function getIVData(symbol: string): Promise<IVData> {
  const data = await fetchYahoo(`/v8/finance/chart/${symbol}?interval=1d&range=1y`) as {
    chart: { result: Array<{ indicators: { quote: Array<{ close: (number | null)[] }> } }> };
  };
  const closes = (data.chart.result[0].indicators?.quote?.[0]?.close ?? []).filter((c): c is number => c != null);

  if (closes.length < 30) {
    return { currentIV: 0.3, ivHigh52w: 0.5, ivLow52w: 0.15, ivRank: 50, ivPercentile: 50 };
  }

  const hvValues: number[] = [];
  for (let i = 30; i < closes.length; i++) {
    const window = closes.slice(i - 30, i);
    const returns = window.slice(1).map((c, j) => Math.log(c / window[j]));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    hvValues.push(Math.sqrt(variance * 252));
  }

  const currentIV = hvValues[hvValues.length - 1] ?? 0.3;
  const ivHigh52w = Math.max(...hvValues);
  const ivLow52w = Math.min(...hvValues);
  const range = ivHigh52w - ivLow52w;
  const ivRank = range > 0 ? Math.round(((currentIV - ivLow52w) / range) * 100) : 50;
  const ivPercentile = Math.round((hvValues.filter((v) => v <= currentIV).length / hvValues.length) * 100);

  return { currentIV, ivHigh52w, ivLow52w, ivRank, ivPercentile };
}

export async function getEarnings(symbol: string): Promise<EarningsInfo> {
  try {
    const data = await fetchYahoo(`/v10/finance/quoteSummary/${symbol}?modules=calendarEvents`) as {
      quoteSummary: { result: Array<{ calendarEvents: { earnings: { earningsDate: Array<{ raw: number; fmt: string }> } } }> };
    };
    const earnings = data.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
    if (!earnings?.earningsDate) return { daysToEarnings: null, earningsDate: null };

    const now = Date.now() / 1000;
    const future = earnings.earningsDate.filter((d) => d.raw > now);
    if (!future.length) return { daysToEarnings: null, earningsDate: null };

    const next = future[0];
    return { earningsDate: next.fmt, daysToEarnings: Math.round((next.raw - now) / 86400) };
  } catch {
    return { daysToEarnings: null, earningsDate: null };
  }
}

function bsGreeks(S: number, K: number, T: number, sigma: number, type: "call" | "put") {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return {
      delta: type === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      theta: 0,
    };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const npd1 = normPdf(d1);
  const delta = type === "call" ? normCdf(d1) : normCdf(d1) - 1;
  const theta = -(S * npd1 * sigma) / (2 * sqrtT) / 365;
  return { delta: Math.round(delta * 1000) / 1000, theta };
}

function estimateIV(S: number, K: number, T: number, marketPrice: number, type: "call" | "put"): number {
  let sigma = 0.5;
  for (let i = 0; i < 20; i++) {
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const nd1 = normCdf(d1), nd2 = normCdf(d2);
    const price = type === "call" ? S * nd1 - K * nd2 : K * (1 - nd2) - S * (1 - nd1);
    const vega = S * normPdf(d1) * sqrtT;
    if (vega < 1e-10) break;
    sigma -= (price - marketPrice) / vega;
    if (sigma <= 0.01) sigma = 0.01;
    if (Math.abs(price - marketPrice) < 0.01) break;
  }
  return Math.max(0.01, Math.min(sigma, 5.0));
}

function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
