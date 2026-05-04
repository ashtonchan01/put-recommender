import { useState } from "react";

interface Props {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function MiniBarChart({ data, height = 100, formatValue = v => `$${v.toLocaleString()}` }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const display = data.slice(-12);

  if (display.length === 0) return null;

  const W = 400, H = height, PAD = { t: 8, r: 4, b: 18, l: 4 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const barW = Math.max(4, iW / display.length - 4);
  const gap = (iW - barW * display.length) / (display.length + 1);

  const values = display.map(d => d.value);
  const absMax = Math.max(Math.max(...values.map(Math.abs)), 1);
  const hasNeg = values.some(v => v < 0);
  const baselineY = hasNeg ? PAD.t + iH * 0.5 : PAD.t + iH;

  const barHeight = (v: number) => (Math.abs(v) / absMax) * (hasNeg ? iH * 0.5 : iH);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {/* Baseline */}
      <line x1={PAD.l} y1={baselineY} x2={PAD.l + iW} y2={baselineY} stroke="#404040" strokeWidth="0.5" strokeDasharray="4,3" />

      {display.map((d, i) => {
        const x = PAD.l + gap + i * (barW + gap);
        const bH = barHeight(d.value);
        const isPos = d.value >= 0;
        const y = isPos ? baselineY - bH : baselineY;
        const isHover = hoverIdx === i;

        return (
          <g key={i}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: "default" }}
          >
            <rect x={x} y={y} width={barW} height={Math.max(bH, 1)} rx={2}
              fill={isPos ? "#34d399" : "#fb7185"}
              opacity={isHover ? 1 : 0.75}
            />
            {/* Label */}
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill="#64748b" fontSize="8">
              {d.label.slice(0, 3)}
            </text>
            {/* Hover tooltip */}
            {isHover && (
              <>
                <rect x={x + barW / 2 - 35} y={Math.min(y, baselineY) - 22} width="70" height="18" rx="4"
                  fill="#1a1a1a" stroke="#262626" strokeWidth="0.5" />
                <text x={x + barW / 2} y={Math.min(y, baselineY) - 9} textAnchor="middle"
                  fill="white" fontSize="9" fontWeight="600">
                  {formatValue(d.value)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
