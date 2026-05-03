import type { TickerResult } from "../hooks/useOptionsData";

interface Props {
  tickers: string[];
  results: Map<string, TickerResult>;
  loaded: number;
}

export function ScanProgress({ tickers, results, loaded }: Props) {
  const total = tickers.length;
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Scanning {total} tickers…</span>
        <span>{loaded}/{total}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-1.5">
        <div
          className="bg-sky-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tickers.map((sym) => {
          const r = results.get(sym);
          const color =
            r?.status === "done" ? "bg-emerald-600" :
            r?.status === "error" ? "bg-red-600" :
            r?.status === "loading" ? "bg-sky-500 animate-pulse" :
            "bg-slate-600";
          return (
            <span key={sym} className={`text-xs px-2 py-0.5 rounded-full text-white ${color}`}>
              {sym}
            </span>
          );
        })}
      </div>
    </div>
  );
}
