import { useState } from "react";

interface Props {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  showArea?: boolean;
  formatValue?: (v: number) => string;
}

const COLORS: Record<string, string> = {
  emerald: "#34d399", cyan: "#22d3ee", rose: "#fb7185",
  amber: "#fbbf24", sky: "#38bdf8", violet: "#a78bfa",
};

export function MiniLineChart({ data, height = 120, color = "emerald", showArea = true, formatValue = v => `$${v.toLocaleString()}` }: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string; value: number } | null>(null);

  if (data.length < 2) return null;

  const W = 400, H = height, PAD = { t: 8, r: 8, b: 20, l: 8 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => ({
    x: PAD.l + (i / (data.length - 1)) * iW,
    y: PAD.t + iH - ((d.value - min) / range) * iH,
    ...d,
  }));

  const linePoints = points.map(p => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${PAD.l},${PAD.t + iH} ${linePoints} ${PAD.l + iW},${PAD.t + iH}`;
  const hex = COLORS[color] ?? COLORS.emerald;
  const gradId = `area-${color}`;

  const handleMouse = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((x - PAD.l) / iW) * (data.length - 1));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    const p = points[clamped];
    setHover({ x: p.x, y: p.y, label: p.label, value: p.value });
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height }}
      onMouseMove={handleMouse}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hex} stopOpacity="0.3" />
          <stop offset="100%" stopColor={hex} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = PAD.t + iH * (1 - pct);
        return <line key={pct} x1={PAD.l} y1={y} x2={PAD.l + iW} y2={y} stroke="#1a1a1a" strokeWidth="0.5" />;
      })}

      {/* Area fill */}
      {showArea && <polygon points={areaPoints} fill={`url(#${gradId})`} />}

      {/* Line */}
      <polyline points={linePoints} fill="none" stroke={hex} strokeWidth="2" strokeLinejoin="round" />

      {/* Hover */}
      {hover && (
        <>
          <line x1={hover.x} y1={PAD.t} x2={hover.x} y2={PAD.t + iH} stroke={hex} strokeWidth="0.5" strokeDasharray="3,3" />
          <circle cx={hover.x} cy={hover.y} r="4" fill={hex} stroke="#000000" strokeWidth="2" />
          <rect x={hover.x - 40} y={hover.y - 28} width="80" height="22" rx="4" fill="#1a1a1a" stroke="#262626" strokeWidth="0.5" />
          <text x={hover.x} y={hover.y - 14} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">
            {formatValue(hover.value)}
          </text>
        </>
      )}

      {/* X-axis labels: first and last */}
      <text x={PAD.l} y={H - 4} fill="#64748b" fontSize="9">{data[0].label}</text>
      <text x={PAD.l + iW} y={H - 4} fill="#64748b" fontSize="9" textAnchor="end">{data[data.length - 1].label}</text>
    </svg>
  );
}
