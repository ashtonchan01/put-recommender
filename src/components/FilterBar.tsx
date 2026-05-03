import type { Filters } from "../types";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

export function FilterBar({ filters, onChange }: Props) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="bg-slate-900 border-t border-slate-700/60 px-4 py-3 flex flex-wrap gap-3">
      <FilterSlider
        label="Δ Min"
        value={filters.deltaMin}
        min={0.05} max={0.40} step={0.025}
        format={(v) => v.toFixed(2)}
        onChange={(v) => set("deltaMin", v)}
      />
      <FilterSlider
        label="Δ Max"
        value={filters.deltaMax}
        min={0.10} max={0.50} step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => set("deltaMax", v)}
      />
      <FilterSlider
        label="DTE Min"
        value={filters.dteMin}
        min={1} max={30} step={1}
        format={(v) => `${v}d`}
        onChange={(v) => set("dteMin", v)}
      />
      <FilterSlider
        label="DTE Max"
        value={filters.dteMax}
        min={21} max={90} step={7}
        format={(v) => `${v}d`}
        onChange={(v) => set("dteMax", v)}
      />
      <FilterSlider
        label="Min Return"
        value={filters.minAnnualizedReturn}
        min={5} max={100} step={5}
        format={(v) => `${v}%`}
        onChange={(v) => set("minAnnualizedReturn", v)}
      />
    </div>
  );
}

function FilterSlider({
  label, value, min, max, step, format, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-[80px]">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="text-white font-medium">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sky-500 cursor-pointer h-1.5"
      />
    </div>
  );
}
