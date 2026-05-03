import { useState } from "react";

interface Props {
  tickers: string[];
  onChange: (tickers: string[]) => void;
}

export function TickerSelector({ tickers, onChange }: Props) {
  const [input, setInput] = useState("");

  const add = () => {
    const sym = input.trim().toUpperCase();
    if (sym && !tickers.includes(sym)) {
      onChange([...tickers, sym]);
    }
    setInput("");
  };

  const remove = (sym: string) => onChange(tickers.filter((t) => t !== sym));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add ticker…"
          maxLength={6}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
        <button
          onClick={add}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tickers.map((sym) => (
          <span
            key={sym}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 rounded-full text-sm text-white"
          >
            {sym}
            <button
              onClick={() => remove(sym)}
              className="text-slate-400 hover:text-red-400 transition-colors leading-none"
              aria-label={`Remove ${sym}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
