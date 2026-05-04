import type { IBKRPosition, IBKRTrade, IBKRSyncData, IBKRConfig } from "../types";

const WORKER_URL = import.meta.env.DEV
  ? "http://localhost:3456"
  : "https://wheel-proxy.ashtonchan.workers.dev";

// ── XML helpers ──────────────────────────────────────────────────────────────

function parseFlexXML(xml: string): { positions: IBKRPosition[]; trades: IBKRTrade[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const positions: IBKRPosition[] = [];
  doc.querySelectorAll("OpenPosition").forEach((el) => {
    const qty = parseFloat(el.getAttribute("position") ?? "0");
    if (qty === 0) return;
    positions.push({
      symbol: el.getAttribute("symbol") ?? "",
      description: el.getAttribute("description") ?? "",
      assetCategory: (el.getAttribute("assetCategory") ?? "") as IBKRPosition["assetCategory"],
      quantity: qty,
      currentValue: parseFloat(el.getAttribute("positionValue") ?? "0"),
      unrealizedPnL: parseFloat(el.getAttribute("fifoPnlUnrealized") ?? "0"),
      putCall: (el.getAttribute("putCall") || undefined) as "P" | "C" | undefined,
      strike: el.getAttribute("strike") ? parseFloat(el.getAttribute("strike")!) : undefined,
      expiry: el.getAttribute("expiry") || undefined,
      markPrice: parseFloat(el.getAttribute("markPrice") ?? "0") || undefined,
      costBasisPrice: parseFloat(el.getAttribute("costBasisPrice") ?? "0") || undefined,
      multiplier: parseFloat(el.getAttribute("multiplier") ?? "100"),
    });
  });

  const trades: IBKRTrade[] = [];
  doc.querySelectorAll("Trade").forEach((el) => {
    const qty = Math.abs(parseFloat(el.getAttribute("quantity") ?? "0"));
    if (qty === 0) return;
    const rawDateTime = el.getAttribute("dateTime") ?? "";
    // IBKR format: "20260420;093500" → ISO
    const isoDateTime = parseIBKRDateTime(rawDateTime);
    trades.push({
      id: el.getAttribute("transactionID") ?? `${rawDateTime}-${Math.random()}`,
      dateTime: isoDateTime,
      symbol: el.getAttribute("symbol") ?? "",
      description: el.getAttribute("description") ?? "",
      assetCategory: (el.getAttribute("assetCategory") ?? "") as IBKRTrade["assetCategory"],
      putCall: (el.getAttribute("putCall") || undefined) as "P" | "C" | undefined,
      strike: el.getAttribute("strike") ? parseFloat(el.getAttribute("strike")!) : undefined,
      expiry: el.getAttribute("expiry") || undefined,
      multiplier: parseFloat(el.getAttribute("multiplier") ?? "100"),
      buySell: (el.getAttribute("buySell") ?? "BUY") as "BUY" | "SELL",
      quantity: qty,
      tradePrice: parseFloat(el.getAttribute("tradePrice") ?? "0"),
      proceeds: parseFloat(el.getAttribute("proceeds") ?? "0"),
      commission: parseFloat(el.getAttribute("ibCommission") ?? el.getAttribute("commission") ?? "0"),
      netCash: parseFloat(el.getAttribute("netCash") ?? "0"),
      openClose: (el.getAttribute("openCloseIndicator") ?? "O") as IBKRTrade["openClose"],
    });
  });

  // Sort trades chronologically
  trades.sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  return { positions, trades };
}

function parseIBKRDateTime(raw: string): string {
  // IBKR uses "20260420;093500" or "2026-04-20, 09:35:00"
  const cleaned = raw.replace(/[;\s,]+/, "T").replace(/(\d{8})T(\d{6})/, (_, d, t) => {
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const time = `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
    return `${date}T${time}`;
  });
  return cleaned || new Date().toISOString();
}

// ── Flex API calls ───────────────────────────────────────────────────────────

async function flexRequest(proxyBase: string, token: string, queryId: string): Promise<string> {
  const res = await fetch(
    `${proxyBase}/ibkr-flex/request?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}`
  );
  const data = await res.json() as { referenceCode?: string; error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.referenceCode) throw new Error("No reference code returned from IBKR");
  return data.referenceCode;
}

async function flexStatement(proxyBase: string, refCode: string): Promise<string> {
  // IBKR takes 1–10 seconds to prepare the report
  await delay(5000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${proxyBase}/ibkr-flex/statement?q=${encodeURIComponent(refCode)}`);
    const text = await res.text();
    // IBKR returns various "not ready" messages — retry on any of them
    if (
      text.includes("Please re-try") ||
      text.includes("retry") ||
      text.includes("could not be generated") ||
      text.includes("try again") ||
      text.includes("Statement generation in progress")
    ) {
      await delay(5000);
      continue;
    }
    if (!res.ok) throw new Error(`Statement fetch failed: ${res.status}`);
    return text;
  }
  throw new Error("IBKR report timed out — try again in a moment");
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function syncFromIBKR(config: IBKRConfig): Promise<IBKRSyncData> {
  if (!config.token)   throw new Error("No Flex token — add it in Settings → IBKR");
  if (!config.queryId) throw new Error("No Query ID — add it in Settings → IBKR");

  const refCode = await flexRequest(WORKER_URL, config.token, config.queryId);
  const xml = await flexStatement(WORKER_URL, refCode);
  const { positions, trades } = parseFlexXML(xml);

  return {
    positions,
    trades,
    lastSync: new Date().toISOString(),
  };
}

// ── LocalStorage cache ───────────────────────────────────────────────────────

const SYNC_KEY = "ibkr-sync-data";

export function saveSyncData(data: IBKRSyncData): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(data));
}

export function loadSyncData(): IBKRSyncData | null {
  try {
    const s = localStorage.getItem(SYNC_KEY);
    return s ? (JSON.parse(s) as IBKRSyncData) : null;
  } catch {
    return null;
  }
}

export function clearSyncData(): void {
  localStorage.removeItem(SYNC_KEY);
}

// ── Derived stats from positions ─────────────────────────────────────────────

export interface PortfolioStats {
  totalUnrealizedPnL: number;
  ytdPremiumCollected: number;  // from trades this year
  openOptionCount: number;
  longStockCount: number;
  shortPutCount: number;
  shortCallCount: number;
  totalCollateralUsed: number;  // strike * 100 * |qty| for short puts
}

export function computeStats(positions: IBKRPosition[], trades: IBKRTrade[]): PortfolioStats {
  const totalUnrealizedPnL = positions.reduce((s, p) => s + p.unrealizedPnL, 0);

  const thisYear = new Date().getFullYear().toString();
  const ytdPremiumCollected = trades
    .filter(t => t.dateTime.startsWith(thisYear) && t.buySell === "SELL" && t.assetCategory === "OPT")
    .reduce((s, t) => s + t.netCash, 0);

  const opts = positions.filter(p => p.assetCategory === "OPT");
  const shortPuts  = opts.filter(p => p.quantity < 0 && p.putCall === "P");
  const shortCalls = opts.filter(p => p.quantity < 0 && p.putCall === "C");
  const longStocks = positions.filter(p => p.assetCategory === "STK" && p.quantity > 0);

  const totalCollateralUsed = shortPuts.reduce((s, p) => {
    return s + (p.strike ?? 0) * 100 * Math.abs(p.quantity) * (p.multiplier ?? 100) / 100;
  }, 0);

  return {
    totalUnrealizedPnL,
    ytdPremiumCollected,
    openOptionCount: opts.length,
    longStockCount: longStocks.length,
    shortPutCount: shortPuts.length,
    shortCallCount: shortCalls.length,
    totalCollateralUsed,
  };
}
