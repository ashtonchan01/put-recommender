import { useState, useEffect, useMemo } from "react";
import type { Filters, OptionType, RiskSettings } from "./types";
import { DEFAULT_FILTERS, DEFAULT_RISK } from "./types";
import { DEFAULT_TICKERS, TICKERS_STORAGE_KEY, FILTERS_STORAGE_KEY, RISK_STORAGE_KEY } from "./config";
import { useOptionsData } from "./hooks/useOptionsData";
import { buildPortfolio } from "./engine/portfolio";
import { OptionCard } from "./components/OptionCard";
import { FilterBar } from "./components/FilterBar";
import { TickerSelector } from "./components/TickerSelector";
import { ScanProgress } from "./components/ScanProgress";
import { RiskPanel } from "./components/RiskPanel";
import { PortfolioBuilder } from "./components/PortfolioBuilder";
import { IBKRPortfolio } from "./components/IBKRPortfolio";

type AppView = "scan" | "portfolio" | "positions" | "settings";

function loadTickers(): string[] {
  try {
    const s = localStorage.getItem(TICKERS_STORAGE_KEY);
    if (s) return JSON.parse(s) as string[];
  } catch { /* ignore */ }
  return DEFAULT_TICKERS;
}

function loadFilters(): Filters {
  try {
    const s = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (s) return { ...DEFAULT_FILTERS, ...JSON.parse(s) } as Filters;
  } catch { /* ignore */ }
  return DEFAULT_FILTERS;
}

function loadRisk(): RiskSettings {
  try {
    const s = localStorage.getItem(RISK_STORAGE_KEY);
    if (s) return { ...DEFAULT_RISK, ...JSON.parse(s) } as RiskSettings;
  } catch { /* ignore */ }
  return DEFAULT_RISK;
}

export default function App() {
  const [appView, setAppView] = useState<AppView>("scan");
  const [tickers, setTickers] = useState<string[]>(loadTickers);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [risk, setRisk] = useState<RiskSettings>(loadRisk);
  const [optionType, setOptionType] = useState<OptionType>("puts");
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { results, allCalls, allPuts, scanning, loadedCount, scan, abort } = useOptionsData(tickers, filters);

  useEffect(() => { localStorage.setItem(TICKERS_STORAGE_KEY, JSON.stringify(tickers)); }, [tickers]);
  useEffect(() => { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters)); }, [filters]);
  useEffect(() => { localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(risk)); }, [risk]);

  const activeOptions = optionType === "puts" ? allPuts : optionType === "calls" ? allCalls : [...allPuts, ...allCalls].sort((a, b) => b.score - a.score);
  const displayOptions = (symbolFilter === "ALL" ? activeOptions : activeOptions.filter((o) => o.symbol === symbolFilter))
    .filter((o) => o.signal !== "SKIP");

  const strongCount = activeOptions.filter((o) => o.signal === "STRONG").length;
  const okCount = activeOptions.filter((o) => o.signal === "OK").length;
  const uniqueSymbols = [...new Set(activeOptions.map((o) => o.symbol))];
  const hasResults = activeOptions.length > 0;
  const hasScanned = results.size > 0;

  const portfolioSuggestion = useMemo(
    () => buildPortfolio(allPuts, allCalls, risk),
    [allPuts, allCalls, risk]
  );

  const navItems: { id: AppView; label: string; icon: string }[] = [
    { id: "scan", label: "Scan", icon: "⚡" },
    { id: "portfolio", label: "Portfolio", icon: "📊" },
    { id: "positions", label: "Positions", icon: "🔗" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold text-white">Wheel Options</h1>
            {hasResults && appView === "scan" && (
              <p className="text-xs text-slate-400">
                {strongCount} strong · {okCount} ok · {uniqueSymbols.length} tickers
              </p>
            )}
            {appView === "portfolio" && portfolioSuggestion.picks.length > 0 && (
              <p className="text-xs text-slate-400">
                {portfolioSuggestion.picks.length} picks · ${portfolioSuggestion.monthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo est.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {appView === "scan" && (
              scanning ? (
                <button
                  onClick={abort}
                  className="px-3 py-1.5 text-sm rounded-lg bg-red-900/60 border border-red-700 text-red-300 hover:text-red-100 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => { setAppView("scan"); scan(); }}
                  disabled={tickers.length === 0}
                  className="px-3 py-1.5 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-40"
                >
                  Scan
                </button>
              )
            )}
          </div>
        </div>

        {/* Puts / Calls / All tabs — only on scan view */}
        {appView === "scan" && (
          <div className="flex gap-1 mt-2.5">
            {(["puts", "calls", "all"] as OptionType[]).map((t) => (
              <button
                key={t}
                onClick={() => setOptionType(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
                  optionType === t
                    ? t === "puts" ? "bg-rose-700 text-white" : t === "calls" ? "bg-violet-700 text-white" : "bg-sky-700 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {t === "puts" ? `Puts${hasResults ? ` (${allPuts.filter(o => o.signal !== "SKIP").length})` : ""}` :
                 t === "calls" ? `Calls${hasResults ? ` (${allCalls.filter(o => o.signal !== "SKIP").length})` : ""}` :
                 `All${hasResults ? ` (${[...allPuts, ...allCalls].filter(o => o.signal !== "SKIP").length})` : ""}`}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Settings view */}
      {appView === "settings" && (
        <div className="flex-1 px-4 py-5 flex flex-col gap-5 overflow-y-auto"
          style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Watchlist</h2>
            <TickerSelector tickers={tickers} onChange={setTickers} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Risk Management</h2>
            <RiskPanel risk={risk} onChange={setRisk} />
          </div>
        </div>
      )}

      {/* Scan view */}
      {appView === "scan" && (
        <div className="flex-1 flex flex-col min-h-0">
          {scanning && (
            <div className="px-4 py-3 border-b border-slate-700/60">
              <ScanProgress tickers={tickers} results={results} loaded={loadedCount} />
            </div>
          )}

          {!hasScanned && !scanning && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="text-5xl">⚡</div>
              <div>
                <p className="text-slate-200 font-semibold">Ready to scan</p>
                <p className="text-slate-500 text-sm mt-1">{tickers.length} tickers in watchlist</p>
                <button
                  onClick={scan}
                  disabled={tickers.length === 0}
                  className="mt-4 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-medium rounded-xl text-sm transition-colors disabled:opacity-40"
                >
                  Scan for Opportunities
                </button>
              </div>
            </div>
          )}

          {hasScanned && !scanning && !hasResults && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="text-3xl">🔍</div>
              <p className="text-slate-400 text-sm">No options matched filters. Try widening delta or lowering min return.</p>
            </div>
          )}

          {hasResults && !scanning && uniqueSymbols.length > 1 && (
            <div className="flex overflow-x-auto gap-2 px-4 py-2 border-b border-slate-700/60 scrollbar-hide shrink-0">
              {["ALL", ...uniqueSymbols].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSymbolFilter(sym)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    symbolFilter === sym ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {sym === "ALL" ? `All (${displayOptions.length})` : sym}
                </button>
              ))}
            </div>
          )}

          {hasResults && (
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
              style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
              {displayOptions.length === 0 && (
                <p className="text-center text-slate-500 text-sm mt-8">No {optionType === "all" ? "options" : optionType} for {symbolFilter}.</p>
              )}
              {displayOptions.map((o, i) => (
                <OptionCard
                  key={`${o.symbol}-${o.contract.type}-${o.contract.strike}-${o.contract.expiry}-${i}`}
                  option={o}
                  risk={risk}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Portfolio view */}
      {appView === "portfolio" && (
        <PortfolioBuilder
          suggestion={portfolioSuggestion}
          risk={risk}
          hasScanned={hasScanned}
          onScan={() => { setAppView("scan"); scan(); }}
        />
      )}

      {/* Positions view */}
      {appView === "positions" && <IBKRPortfolio />}

      {/* Filter bar — only on scan view */}
      {appView === "scan" && (
        <div className="sticky bottom-0 z-10">
          <button
            onClick={() => setFiltersOpen((prev) => !prev)}
            className="w-full bg-slate-900/95 border-t border-slate-700/60 px-4 py-2.5 flex items-center justify-between text-sm text-slate-400 hover:text-white transition-colors"
          >
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
      )}

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-10 bg-slate-900/95 backdrop-blur border-t border-slate-700/60 flex">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { setAppView(item.id); setFiltersOpen(false); }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
              appView === item.id ? "text-sky-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
