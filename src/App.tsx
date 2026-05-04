import { useState, useEffect, useMemo, useCallback } from "react";
import type { Filters, OptionType, RiskSettings, IBKRConfig, IBKRSyncData } from "./types";
import { DEFAULT_FILTERS, DEFAULT_RISK } from "./types";
import { DEFAULT_TICKERS, TICKERS_STORAGE_KEY, FILTERS_STORAGE_KEY, RISK_STORAGE_KEY, IBKR_CONFIG_KEY } from "./config";
import { useOptionsData } from "./hooks/useOptionsData";
import { buildPortfolio } from "./engine/portfolio";
import { buildWheelCycles, buildMonthlyIncome, buildTickerPnL } from "./engine/wheels";
import { generateActions } from "./engine/recommendations";
import { syncFromIBKR, saveSyncData, loadSyncData, computeStats } from "./services/ibkr";
import { OptionCard } from "./components/OptionCard";
import { FilterBar } from "./components/FilterBar";
import { TickerSelector } from "./components/TickerSelector";
import { ScanProgress } from "./components/ScanProgress";
import { RiskPanel } from "./components/RiskPanel";
import { PortfolioBuilder } from "./components/PortfolioBuilder";
import { ActionCenter } from "./components/ActionCenter";
import { JournalView } from "./components/journal/JournalView";

type AppView = "actions" | "scan" | "journal" | "settings";

// ── localStorage loaders ─────────────────────────────────────────────────────

function loadTickers(): string[] {
  try { const s = localStorage.getItem(TICKERS_STORAGE_KEY); if (s) return JSON.parse(s); } catch { /* */ }
  return DEFAULT_TICKERS;
}
function loadFilters(): Filters {
  try { const s = localStorage.getItem(FILTERS_STORAGE_KEY); if (s) return { ...DEFAULT_FILTERS, ...JSON.parse(s) }; } catch { /* */ }
  return DEFAULT_FILTERS;
}
function loadRisk(): RiskSettings {
  try { const s = localStorage.getItem(RISK_STORAGE_KEY); if (s) return { ...DEFAULT_RISK, ...JSON.parse(s) }; } catch { /* */ }
  return DEFAULT_RISK;
}
function loadIBKRConfig(): IBKRConfig {
  try { const s = localStorage.getItem(IBKR_CONFIG_KEY); if (s) return JSON.parse(s); } catch { /* */ }
  return { token: "", queryId: "" };
}

export default function App() {
  const [appView, setAppView]         = useState<AppView>("actions");
  const [tickers, setTickers]         = useState<string[]>(loadTickers);
  const [filters, setFilters]         = useState<Filters>(loadFilters);
  const [risk, setRisk]               = useState<RiskSettings>(loadRisk);
  const [ibkrConfig, setIBKRConfig]   = useState<IBKRConfig>(loadIBKRConfig);
  const [optionType, setOptionType]   = useState<OptionType>("puts");
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [syncData, setSyncData]       = useState<IBKRSyncData | null>(() => loadSyncData());
  const [syncing, setSyncing]         = useState(false);
  const [syncError, setSyncError]     = useState<string | null>(null);

  // Persist settings
  useEffect(() => { localStorage.setItem(TICKERS_STORAGE_KEY, JSON.stringify(tickers)); }, [tickers]);
  useEffect(() => { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters)); }, [filters]);
  useEffect(() => { localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(risk)); }, [risk]);
  useEffect(() => { localStorage.setItem(IBKR_CONFIG_KEY, JSON.stringify(ibkrConfig)); }, [ibkrConfig]);

  // Scanner
  const { results, allCalls, allPuts, scanning, loadedCount, scan, abort } = useOptionsData(tickers, filters);

  // IBKR sync
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const data = await syncFromIBKR(ibkrConfig);
      saveSyncData(data);
      setSyncData(data);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [ibkrConfig]);

  // Derived data
  const positions = syncData?.positions ?? [];
  const trades    = syncData?.trades ?? [];

  const cycles       = useMemo(() => buildWheelCycles(trades), [trades]);
  const monthly      = useMemo(() => buildMonthlyIncome(trades), [trades]);
  const tickerPnL    = useMemo(() => buildTickerPnL(cycles), [cycles]);
  const stats        = useMemo(() => syncData ? computeStats(positions, trades) : null, [positions, trades, syncData]);
  const actions      = useMemo(() => generateActions(positions, allPuts, allCalls, risk), [positions, allPuts, allCalls, risk]);
  const portfolio    = useMemo(() => buildPortfolio(allPuts, allCalls, risk), [allPuts, allCalls, risk]);

  // Scan view helpers
  const activeOptions = optionType === "puts" ? allPuts : optionType === "calls" ? allCalls : [...allPuts, ...allCalls].sort((a, b) => b.score - a.score);
  const displayOptions = (symbolFilter === "ALL" ? activeOptions : activeOptions.filter(o => o.symbol === symbolFilter)).filter(o => o.signal !== "SKIP");
  const hasResults  = activeOptions.length > 0;
  const hasScanned  = results.size > 0;
  const uniqueSymbols = [...new Set(activeOptions.map(o => o.symbol))];

  const nav: { id: AppView; label: string; icon: string; badge?: number }[] = [
    { id: "actions", label: "Actions",  icon: "⚡", badge: actions.filter(a => a.urgency === "urgent").length || undefined },
    { id: "journal", label: "Journal",  icon: "📓" },
    { id: "scan",    label: "Scan",     icon: "🔍" },
    { id: "settings",label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold text-white">Wheel Tracker</h1>
            <p className="text-xs text-slate-500">
              {appView === "actions" && (actions.length > 0 ? `${actions.length} action${actions.length !== 1 ? "s" : ""}` : "All clear")}
              {appView === "journal" && (cycles.length > 0 ? `${cycles.filter(c => c.status !== "closed").length} open wheels` : "No data")}
              {appView === "scan"    && (hasResults ? `${displayOptions.length} opportunities` : "Ready to scan")}
              {appView === "settings" && "Settings"}
            </p>
          </div>
          {appView === "scan" && (
            scanning
              ? <button onClick={abort} className="px-3 py-1.5 text-sm rounded-lg bg-red-900/60 border border-red-700 text-red-300 hover:text-red-100 transition-colors">Stop</button>
              : <button onClick={() => { setAppView("scan"); scan(); }} disabled={tickers.length === 0} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-40">Scan</button>
          )}
        </div>

        {/* Puts / Calls / All — scan view only */}
        {appView === "scan" && (
          <div className="flex gap-1 mt-2.5">
            {(["puts", "calls", "all"] as OptionType[]).map(t => (
              <button key={t} onClick={() => setOptionType(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
                  optionType === t
                    ? t === "puts" ? "bg-rose-700 text-white" : t === "calls" ? "bg-violet-700 text-white" : "bg-sky-700 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}>
                {t === "puts"  ? `Puts${hasResults ? ` (${allPuts.filter(o => o.signal !== "SKIP").length})` : ""}` :
                 t === "calls" ? `Calls${hasResults ? ` (${allCalls.filter(o => o.signal !== "SKIP").length})` : ""}` :
                                 `All${hasResults ? ` (${[...allPuts,...allCalls].filter(o => o.signal !== "SKIP").length})` : ""}`}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Action Center ───────────────────────────────────────────────── */}
      {appView === "actions" && (
        <ActionCenter
          actions={actions}
          stats={stats}
          syncData={syncData}
          risk={risk}
          onSync={handleSync}
          syncing={syncing}
          syncError={syncError}
          hasScanned={hasScanned}
          onScan={() => { setAppView("scan"); scan(); }}
        />
      )}

      {/* ── Journal ─────────────────────────────────────────────────────── */}
      {appView === "journal" && (
        <JournalView
          cycles={cycles}
          trades={trades}
          monthlyIncome={monthly}
          tickerPnL={tickerPnL}
          hasData={!!syncData}
        />
      )}

      {/* ── Scan ────────────────────────────────────────────────────────── */}
      {appView === "scan" && (
        <div className="flex-1 flex flex-col min-h-0">
          {scanning && (
            <div className="px-4 py-3 border-b border-slate-700/60">
              <ScanProgress tickers={tickers} results={results} loaded={loadedCount} />
            </div>
          )}
          {!hasScanned && !scanning && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="text-5xl">🔍</div>
              <div>
                <p className="text-slate-200 font-semibold">Find opportunities</p>
                <p className="text-slate-500 text-sm mt-1">{tickers.length} tickers · {risk.targetPositions} target positions</p>
                <button onClick={scan} disabled={tickers.length === 0}
                  className="mt-4 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-medium rounded-xl text-sm transition-colors disabled:opacity-40">
                  Scan for Opportunities
                </button>
              </div>
            </div>
          )}
          {hasScanned && !scanning && !hasResults && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-slate-400 text-sm">No options matched filters.</p>
            </div>
          )}
          {hasResults && !scanning && uniqueSymbols.length > 1 && (
            <div className="flex overflow-x-auto gap-2 px-4 py-2 border-b border-slate-700/60 scrollbar-hide shrink-0">
              {["ALL", ...uniqueSymbols].map(sym => (
                <button key={sym} onClick={() => setSymbolFilter(sym)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${symbolFilter === sym ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                  {sym === "ALL" ? `All (${displayOptions.length})` : sym}
                </button>
              ))}
            </div>
          )}
          {hasResults && (
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
              style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>
              {displayOptions.map((o, i) => (
                <OptionCard key={`${o.symbol}-${o.contract.type}-${o.contract.strike}-${o.contract.expiry}-${i}`} option={o} risk={risk} />
              ))}
            </div>
          )}
          {/* Filter bar */}
          <div className="sticky bottom-0 z-10">
            <button onClick={() => setFiltersOpen(v => !v)}
              className="w-full bg-slate-900/95 border-t border-slate-700/60 px-4 py-2.5 flex items-center justify-between text-sm text-slate-400 hover:text-white transition-colors">
              <span className="font-medium text-slate-300">Filters</span>
              <span className="flex gap-3 text-xs">
                <span>Δ {filters.deltaMin.toFixed(2)}–{filters.deltaMax.toFixed(2)}</span>
                <span>{filters.dteMin}–{filters.dteMax}d</span>
                <span>≥{filters.minAnnualizedReturn}% ann.</span>
                <span className="text-slate-600">{filtersOpen ? "▲" : "▼"}</span>
              </span>
            </button>
            {filtersOpen && <FilterBar filters={filters} onChange={setFilters} />}
          </div>
        </div>
      )}

      {/* ── Portfolio builder (accessible within Scan via a sub-button or move to scan header) */}
      {/* Kept inside scan view as a secondary view if needed — Portfolio builder remains accessible */}

      {/* ── Settings ─────────────────────────────────────────────────────── */}
      {appView === "settings" && (
        <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5"
          style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>

          {/* IBKR Connection */}
          <section>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">IBKR Connection</h2>
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex flex-col gap-3">
              <IBKRField label="Flex Token" placeholder="Paste your IBKR Flex token" value={ibkrConfig.token} onChange={v => setIBKRConfig(c => ({...c, token: v}))} secret />
              <IBKRField label="Query ID" placeholder="Paste your Flex Query ID" value={ibkrConfig.queryId} onChange={v => setIBKRConfig(c => ({...c, queryId: v}))} />

              <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 flex flex-col gap-1.5 mt-1">
                <p className="font-semibold text-slate-300">Step 1 — Create Flex Query in IBKR</p>
                <p>Client Portal → Performance &amp; Reports → Flex Queries → Create</p>
                <p>Enable these sections (Last 365 Days, XML format):</p>
                <p className="pl-2 text-slate-300">• Trades &amp; Executions</p>
                <p className="pl-2 text-slate-300">• Open Positions</p>
                <p className="pl-2 text-slate-300">• Option Exercises, Assignments &amp; Expirations</p>
                <p>Save → note the <span className="text-slate-300">Query ID</span>.</p>

                <p className="font-semibold text-slate-300 mt-1">Step 2 — Get Flex Token</p>
                <p>Client Portal → Settings → Account Settings → Flex Web Service → Generate Token (set expiry to 1 year).</p>

                <p className="font-semibold text-slate-300 mt-1">Step 3 — Paste above &amp; hit Sync</p>
              </div>

              <button onClick={handleSync} disabled={syncing}
                className="w-full py-2.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white font-medium rounded-xl text-sm transition-colors">
                {syncing ? "Syncing…" : "Test Sync"}
              </button>
              {syncError && <p className="text-rose-400 text-xs">{syncError}</p>}
              {syncData && <p className="text-emerald-400 text-xs">Last sync: {new Date(syncData.lastSync).toLocaleString()}</p>}
            </div>
          </section>

          {/* Risk Management */}
          <section>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Risk Management</h2>
            <RiskPanel risk={risk} onChange={setRisk} />
          </section>

          {/* Watchlist */}
          <section>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Scan Watchlist</h2>
            <TickerSelector tickers={tickers} onChange={setTickers} />
          </section>

          {/* Portfolio builder preview */}
          {hasScanned && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Portfolio Suggestion</h2>
              <PortfolioBuilder suggestion={portfolio} risk={risk} hasScanned={hasScanned} onScan={() => { setAppView("scan"); scan(); }} />
            </section>
          )}
        </div>
      )}

      {/* ── Bottom navigation ────────────────────────────────────────────── */}
      {appView !== "scan" && (
        <nav className="sticky bottom-0 z-10 bg-slate-900/95 backdrop-blur border-t border-slate-700/60 flex"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {nav.map(item => (
            <button key={item.id} onClick={() => { setAppView(item.id); setFiltersOpen(false); }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors relative ${
                appView === item.id ? "text-sky-400" : "text-slate-500 hover:text-slate-300"
              }`}>
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {(item.badge ?? 0) > 0 && (
                <span className="absolute top-1.5 right-1/4 -translate-x-1 w-4 h-4 bg-rose-500 rounded-full text-white text-xs flex items-center justify-center font-bold leading-none">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      )}

      {/* Scan view has its own filter bar as sticky bottom; show nav above it */}
      {appView === "scan" && (
        <nav className="sticky bottom-[3.5rem] z-10 bg-slate-900/95 backdrop-blur border-t border-slate-700/60 flex"
          style={{ paddingBottom: 0 }}>
          {nav.map(item => (
            <button key={item.id} onClick={() => { setAppView(item.id); setFiltersOpen(false); }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors relative ${
                appView === item.id ? "text-sky-400" : "text-slate-500 hover:text-slate-300"
              }`}>
              <span className="text-sm leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {(item.badge ?? 0) > 0 && (
                <span className="absolute top-1 right-1/4 -translate-x-1 w-4 h-4 bg-rose-500 rounded-full text-white text-xs flex items-center justify-center font-bold leading-none">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function IBKRField({ label, placeholder, value, onChange, secret }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; secret?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      <input type={secret ? "password" : "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500" />
    </div>
  );
}
