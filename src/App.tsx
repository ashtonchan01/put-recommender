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
type JournalSub = "profit" | "calendar" | "wheels" | "trades" | "ticker";

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

// ── Nav config ──────────────────────────────────────────────────────────────

interface NavItem {
  id: AppView;
  label: string;
  icon: string;
  children?: { id: JournalSub; label: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { id: "actions", label: "Action Center", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  {
    id: "journal", label: "Journal", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    children: [
      { id: "profit", label: "Profit View" },
      { id: "calendar", label: "Calendar" },
      { id: "wheels", label: "Open Wheels" },
      { id: "trades", label: "Trades" },
      { id: "ticker", label: "Per-Ticker" },
    ],
  },
  { id: "scan", label: "Find Deals", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
  { id: "settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export default function App() {
  const [appView, setAppView]         = useState<AppView>("actions");
  const [journalTab, setJournalTab]   = useState<JournalSub>("profit");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(true);
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
  const urgentCount = actions.filter(a => a.urgency === "urgent").length;

  const navigate = (view: AppView) => {
    setAppView(view);
    setFiltersOpen(false);
    setSidebarOpen(false);
  };

  return (
    <div className="h-screen bg-black text-white flex overflow-hidden">

      {/* ── Mobile overlay ─────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-56 flex flex-col
        bg-neutral-950 border-r border-white/[0.06]
        transition-transform duration-200 ease-out
        ${sidebarOpen ? "tranneutral-x-0" : "-tranneutral-x-full lg:tranneutral-x-0"}
      `}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/[0.06]">
          <h1 className="text-sm font-bold text-white tracking-tight">Wheel Tracker</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Options Income Dashboard</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV_ITEMS.map(item => (
            <div key={item.id}>
              <button
                onClick={() => {
                  if (item.children) {
                    if (appView === item.id) setJournalOpen(v => !v);
                    else { navigate(item.id); setJournalOpen(true); }
                  } else {
                    navigate(item.id);
                  }
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                  appView === item.id
                    ? "bg-white/[0.08] text-white"
                    : "text-neutral-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === "actions" && urgentCount > 0 && (
                  <span className="w-5 h-5 bg-rose-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                    {urgentCount}
                  </span>
                )}
                {item.children && (
                  <svg className={`w-3.5 h-3.5 transition-transform ${appView === item.id && journalOpen ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>

              {/* Sub-items */}
              {item.children && appView === item.id && journalOpen && (
                <div className="ml-4 pl-3 border-l border-white/[0.06] mt-1 mb-2 flex flex-col gap-0.5">
                  {item.children.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => { setJournalTab(sub.id); setSidebarOpen(false); }}
                      className={`text-left px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        journalTab === sub.id
                          ? "text-white bg-white/[0.06]"
                          : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.03]"
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Sync status at bottom */}
        <div className="px-3 py-3 border-t border-white/[0.06]">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40"
          >
            <div className={`w-2 h-2 rounded-full ${syncData ? "bg-emerald-400" : "bg-neutral-600"}`} />
            <span className="text-neutral-300">{syncing ? "Syncing…" : syncData ? "IBKR Connected" : "Not synced"}</span>
          </button>
          {syncData && (
            <p className="text-neutral-600 text-xs mt-1.5 px-3">
              {new Date(syncData.lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar (mobile hamburger + page title + scan controls) */}
        <header className="sticky top-0 z-20 bg-black/80 backdrop-blur-xl border-b border-white/[0.06] px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Hamburger (mobile only) */}
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1 -ml-1 text-neutral-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {appView === "actions" && "Action Center"}
                  {appView === "journal" && "Journal"}
                  {appView === "scan" && "Find Deals"}
                  {appView === "settings" && "Settings"}
                </h2>
                <p className="text-xs text-neutral-500">
                  {appView === "actions" && (actions.length > 0 ? `${actions.length} action${actions.length !== 1 ? "s" : ""}` : "All clear")}
                  {appView === "journal" && (cycles.length > 0 ? `${cycles.filter(c => c.status !== "closed").length} open wheels` : "No data")}
                  {appView === "scan" && (hasResults ? `${displayOptions.length} opportunities` : "Ready to scan")}
                  {appView === "settings" && "Configure your account"}
                </p>
              </div>
            </div>
            {appView === "scan" && (
              scanning
                ? <button onClick={abort} className="px-3 py-1.5 text-sm rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors">Stop</button>
                : <button onClick={() => scan()} disabled={tickers.length === 0} className="px-4 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium transition-all disabled:opacity-40">Scan</button>
            )}
          </div>

          {/* Scan type selector */}
          {appView === "scan" && (
            <div className="flex gap-1 mt-2.5">
              {(["puts", "calls", "all"] as OptionType[]).map(t => (
                <button key={t} onClick={() => setOptionType(t)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    optionType === t
                      ? "bg-white/10 text-white"
                      : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04]"
                  }`}>
                  {t === "puts"  ? `Puts${hasResults ? ` (${allPuts.filter(o => o.signal !== "SKIP").length})` : ""}` :
                   t === "calls" ? `Calls${hasResults ? ` (${allCalls.filter(o => o.signal !== "SKIP").length})` : ""}` :
                                   `All${hasResults ? ` (${[...allPuts,...allCalls].filter(o => o.signal !== "SKIP").length})` : ""}`}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ── Page content ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">

          {appView === "actions" && (
            <ActionCenter
              actions={actions} stats={stats} syncData={syncData} risk={risk}
              onSync={handleSync} syncing={syncing} syncError={syncError}
              hasScanned={hasScanned} onScan={() => { setAppView("scan"); scan(); }}
              cycles={cycles} monthlyIncome={monthly}
            />
          )}

          {appView === "journal" && (
            <JournalView
              cycles={cycles} trades={trades} monthlyIncome={monthly}
              tickerPnL={tickerPnL} hasData={!!syncData}
              initialTab={journalTab} onTabChange={setJournalTab}
            />
          )}

          {appView === "scan" && (
            <div className="flex-1 flex flex-col min-h-0">
              {scanning && (
                <div className="px-4 lg:px-6 py-3 border-b border-white/[0.06]">
                  <ScanProgress tickers={tickers} results={results} loaded={loadedCount} />
                </div>
              )}
              {!hasScanned && !scanning && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center text-3xl">🔍</div>
                  <div>
                    <p className="text-white font-semibold">Find opportunities</p>
                    <p className="text-neutral-500 text-sm mt-1">{tickers.length} tickers · {risk.targetPositions} target positions</p>
                    <button onClick={scan} disabled={tickers.length === 0}
                      className="mt-4 px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white font-medium rounded-xl text-sm transition-all disabled:opacity-40">
                      Scan for Opportunities
                    </button>
                  </div>
                </div>
              )}
              {hasScanned && !scanning && !hasResults && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-neutral-400 text-sm">No options matched filters.</p>
                </div>
              )}
              {hasResults && !scanning && uniqueSymbols.length > 1 && (
                <div className="flex overflow-x-auto gap-2 px-4 lg:px-6 py-2 border-b border-white/[0.06] scrollbar-hide shrink-0">
                  {["ALL", ...uniqueSymbols].map(sym => (
                    <button key={sym} onClick={() => setSymbolFilter(sym)}
                      className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        symbolFilter === sym ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white hover:bg-white/[0.04]"
                      }`}>
                      {sym === "ALL" ? `All (${displayOptions.length})` : sym}
                    </button>
                  ))}
                </div>
              )}
              {hasResults && (
                <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 flex flex-col gap-3">
                  {displayOptions.map((o, i) => (
                    <OptionCard key={`${o.symbol}-${o.contract.type}-${o.contract.strike}-${o.contract.expiry}-${i}`} option={o} risk={risk} />
                  ))}
                </div>
              )}
              {/* Filter bar */}
              <div className="border-t border-white/[0.06]">
                <button onClick={() => setFiltersOpen(v => !v)}
                  className="w-full bg-black/80 px-4 lg:px-6 py-2.5 flex items-center justify-between text-sm text-neutral-400 hover:text-white transition-colors">
                  <span className="font-medium text-neutral-300">Filters</span>
                  <span className="flex gap-3 text-xs">
                    <span>Δ {filters.deltaMin.toFixed(2)}–{filters.deltaMax.toFixed(2)}</span>
                    <span>{filters.dteMin}–{filters.dteMax}d</span>
                    <span>≥{filters.minAnnualizedReturn}% ann.</span>
                    <span className="text-neutral-600">{filtersOpen ? "▲" : "▼"}</span>
                  </span>
                </button>
                {filtersOpen && <FilterBar filters={filters} onChange={setFilters} />}
              </div>
            </div>
          )}

          {appView === "settings" && (
            <div className="px-4 lg:px-6 py-5 flex flex-col gap-5 max-w-2xl">

              <section>
                <h2 className="text-sm font-semibold text-neutral-300 mb-3">IBKR Connection</h2>
                <div className="glass-card p-4 flex flex-col gap-3">
                  <IBKRField label="Flex Token" placeholder="Paste your IBKR Flex token" value={ibkrConfig.token} onChange={v => setIBKRConfig(c => ({...c, token: v}))} />
                  <IBKRField label="Query ID" placeholder="Paste your Flex Query ID" value={ibkrConfig.queryId} onChange={v => setIBKRConfig(c => ({...c, queryId: v}))} />

                  <div className="bg-neutral-900/60 rounded-lg p-3 text-xs text-neutral-400 flex flex-col gap-1.5 mt-1">
                    <p className="font-semibold text-neutral-300">Step 1 — Create Flex Query in IBKR</p>
                    <p>Client Portal → Performance &amp; Reports → Flex Queries → Create</p>
                    <p>Enable these sections (Last 365 Days, XML format):</p>
                    <p className="pl-2 text-neutral-300">• Trades &amp; Executions</p>
                    <p className="pl-2 text-neutral-300">• Open Positions</p>
                    <p className="pl-2 text-neutral-300">• Option Exercises, Assignments &amp; Expirations</p>
                    <p>Save → note the <span className="text-neutral-300">Query ID</span>.</p>
                    <p className="font-semibold text-neutral-300 mt-1">Step 2 — Get Flex Token</p>
                    <p>Client Portal → Settings → Account Settings → Flex Web Service → Generate Token (set expiry to 1 year).</p>
                    <p className="font-semibold text-neutral-300 mt-1">Step 3 — Paste above &amp; hit Sync</p>
                  </div>

                  <button onClick={handleSync} disabled={syncing}
                    className="w-full py-2.5 bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white font-medium rounded-xl text-sm transition-all">
                    {syncing ? "Syncing…" : "Test Sync"}
                  </button>
                  {syncError && <p className="text-rose-400 text-xs">{syncError}</p>}
                  {syncData && <p className="text-emerald-400 text-xs">Last sync: {new Date(syncData.lastSync).toLocaleString()}</p>}
                </div>
              </section>

              <section>
                <h2 className="text-sm font-semibold text-neutral-300 mb-3">Risk Management</h2>
                <RiskPanel risk={risk} onChange={setRisk} />
              </section>

              <section>
                <h2 className="text-sm font-semibold text-neutral-300 mb-3">Scan Watchlist</h2>
                <TickerSelector tickers={tickers} onChange={setTickers} />
              </section>

              {hasScanned && (
                <section>
                  <h2 className="text-sm font-semibold text-neutral-300 mb-3">Portfolio Suggestion</h2>
                  <PortfolioBuilder suggestion={portfolio} risk={risk} hasScanned={hasScanned} onScan={() => { setAppView("scan"); scan(); }} />
                </section>
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

function IBKRField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-neutral-400 font-medium">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-white/20 transition-all" />
    </div>
  );
}
