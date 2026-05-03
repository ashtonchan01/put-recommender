import { useState, useEffect } from "react";
import type { Filters, OptionType } from "./types";
import { DEFAULT_FILTERS } from "./types";
import { DEFAULT_TICKERS, TICKERS_STORAGE_KEY, FILTERS_STORAGE_KEY } from "./config";
import { useOptionsData } from "./hooks/useOptionsData";
import { OptionCard } from "./components/OptionCard";
import { FilterBar } from "./components/FilterBar";
import { TickerSelector } from "./components/TickerSelector";
import { ScanProgress } from "./components/ScanProgress";

type AppView = "results" | "settings";

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

export default function App() {
  const [appView, setAppView] = useState<AppView>("results");
  const [tickers, setTickers] = useState<string[]>(loadTickers);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [optionType, setOptionType] = useState<OptionType>("puts");
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { results, allCalls, allPuts, scanning, loadedCount, scan, abort } = useOptionsData(tickers, filters);

  useEffect(() => {
    localStorage.setItem(TICKERS_STORAGE_KEY, JSON.stringify(tickers));
  }, [tickers]);

  useEffect(() => {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const activeOptions = optionType === "puts" ? allPuts : optionType === "calls" ? allCalls : [...allPuts, ...allCalls].sort((a, b) => b.score - a.score);
  const displayOptions = (symbolFilter === "ALL" ? activeOptions : activeOptions.filter((o) => o.symbol === symbolFilter))
    .filter((o) => o.signal !== "SKIP");

  const strongCount = activeOptions.filter((o) => o.signal === "STRONG").length;
  const okCount = activeOptions.filter((o) => o.signal === "OK").length;
  const uniqueSymbols = [...new Set(activeOptions.map((o) => o.symbol))];
  const hasResults = activeOptions.length > 0;
  const hasScanned = results.size > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold text-white">Wheel Options</h1>
            {hasResults && (
              <p className="text-xs text-slate-400">
                {strongCount} strong · {okCount} ok · {uniqueSymbols.length} tickers
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAppView(appView === "settings" ? "results" : "settings")}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                appView === "settings"
                  ? "bg-sky-600 border-sky-500 text-white"
                  : "bg-slate-800 border-slate-600 text-slate-300 hover:text-white"
              }`}
            >
              {appView === "settings" ? "Done" : "Tickers"}
            </button>
            {scanning ? (
              <button
                onClick={abort}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-900/60 border border-red-700 text-red-300 hover:text-red-100 transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => { setAppView("results"); scan(); }}
                disabled={tickers.length === 0}
                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-40"
              >
                Scan
              </button>
            )}
          </div>
        </div>

        {/* Puts / Calls / All tabs */}
        {appView === "results" && (
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

      {/* Settings */}
      {appView === "settings" && (
        <div className="flex-1 px-4 py-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Watchlist</h2>
          <TickerSelector tickers={tickers} onChange={setTickers} />
        </div>
      )}

      {/* Results */}
      {appView === "results" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Scan progress */}
          {scanning && (
            <div className="px-4 py-3 border-b border-slate-700/60">
              <ScanProgress tickers={tickers} results={results} loaded={loadedCount} />
            </div>
          )}

          {/* Empty states */}
          {!hasScanned && !scanning && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="text-5xl">⚙️</div>
              <div>
                <p className="text-slate-200 font-semibold">Ready to scan</p>
                <p className="text-slate-500 text-sm mt-1">
                  {tickers.length} tickers in watchlist
                </p>
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
              <p className="text-slate-400 text-sm">
                No options matched your filters. Try widening delta or lowering the minimum return.
              </p>
            </div>
          )}

          {/* Symbol filter tabs */}
          {hasResults && !scanning && uniqueSymbols.length > 1 && (
            <div className="flex overflow-x-auto gap-2 px-4 py-2 border-b border-slate-700/60 scrollbar-hide shrink-0">
              {["ALL", ...uniqueSymbols].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSymbolFilter(sym)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    symbolFilter === sym
                      ? "bg-sky-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {sym === "ALL" ? `All (${displayOptions.length})` : sym}
                </button>
              ))}
            </div>
          )}

          {/* Options list */}
          {hasResults && (
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
              {displayOptions.length === 0 && (
                <p className="text-center text-slate-500 text-sm mt-8">
                  No {optionType === "all" ? "options" : optionType} for {symbolFilter}.
                </p>
              )}
              {displayOptions.map((o, i) => (
                <OptionCard
                  key={`${o.symbol}-${o.contract.type}-${o.contract.strike}-${o.contract.expiry}-${i}`}
                  option={o}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter bar — sticky at bottom */}
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
    </div>
  );
}
