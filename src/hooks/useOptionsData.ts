import { useState, useCallback, useRef } from "react";
import type { ScoredOption, Filters } from "../types";
import * as yahoo from "../services/yahoo";
import { scoreOptions } from "../engine/scorer";

export type TickerStatus = "idle" | "loading" | "done" | "error";

export interface TickerResult {
  status: TickerStatus;
  calls: ScoredOption[];
  puts: ScoredOption[];
  error?: string;
}

export function useOptionsData(tickers: string[], filters: Filters) {
  const [results, setResults] = useState<Map<string, TickerResult>>(new Map());
  const [scanning, setScanning] = useState(false);
  const abortRef = useRef<boolean>(false);

  const setTicker = useCallback((symbol: string, value: TickerResult) => {
    setResults((prev) => new Map(prev).set(symbol, value));
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    abortRef.current = false;
    setResults(new Map(tickers.map((t) => [t, { status: "loading", calls: [], puts: [] }])));

    await Promise.all(
      tickers.map(async (symbol) => {
        try {
          const [{ calls, puts, price }, ivData, earnings] = await Promise.all([
            yahoo.getOptions(symbol),
            yahoo.getIVData(symbol),
            yahoo.getEarnings(symbol),
          ]);

          if (abortRef.current) return;

          const scoredCalls = scoreOptions(symbol, price, calls, ivData.ivRank, earnings.daysToEarnings, filters);
          const scoredPuts = scoreOptions(symbol, price, puts, ivData.ivRank, earnings.daysToEarnings, filters);

          setTicker(symbol, { status: "done", calls: scoredCalls, puts: scoredPuts });
        } catch (err) {
          if (!abortRef.current) {
            setTicker(symbol, {
              status: "error",
              calls: [],
              puts: [],
              error: err instanceof Error ? err.message : "Failed",
            });
          }
        }
      })
    );

    setScanning(false);
  }, [tickers, filters, setTicker]);

  const abort = useCallback(() => {
    abortRef.current = true;
    setScanning(false);
  }, []);

  const allCalls = [...results.values()].flatMap((r) => r.calls).sort((a, b) => b.score - a.score);
  const allPuts = [...results.values()].flatMap((r) => r.puts).sort((a, b) => b.score - a.score);
  const loadedCount = [...results.values()].filter((r) => r.status === "done" || r.status === "error").length;

  return { results, allCalls, allPuts, scanning, loadedCount, scan, abort };
}
