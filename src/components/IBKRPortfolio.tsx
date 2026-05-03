import { useState } from "react";
import type { IBKRConfig, IBKRPosition } from "../types";
import { IBKR_CONFIG_KEY } from "../config";

const DEFAULT_CONFIG: IBKRConfig = {
  token: "",
  queryId: "",
  proxyUrl: "",
};

function loadConfig(): IBKRConfig {
  try {
    const s = localStorage.getItem(IBKR_CONFIG_KEY);
    if (s) return { ...DEFAULT_CONFIG, ...JSON.parse(s) };
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

function saveConfig(cfg: IBKRConfig) {
  localStorage.setItem(IBKR_CONFIG_KEY, JSON.stringify(cfg));
}

function parseFlexXML(xml: string): IBKRPosition[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const positions: IBKRPosition[] = [];

  doc.querySelectorAll("OpenPosition").forEach((el) => {
    const qty = parseFloat(el.getAttribute("position") ?? "0");
    if (qty === 0) return;
    positions.push({
      symbol: el.getAttribute("symbol") ?? "",
      description: el.getAttribute("description") ?? "",
      assetCategory: el.getAttribute("assetCategory") ?? "",
      quantity: qty,
      currentValue: parseFloat(el.getAttribute("positionValue") ?? "0"),
      unrealizedPnL: parseFloat(el.getAttribute("fifoPnlUnrealized") ?? "0"),
      putCall: el.getAttribute("putCall") || undefined,
      strike: el.getAttribute("strike") ? parseFloat(el.getAttribute("strike")!) : undefined,
      expiry: el.getAttribute("expiry") || undefined,
      markPrice: parseFloat(el.getAttribute("markPrice") ?? "0"),
      costBasisPrice: parseFloat(el.getAttribute("costBasisPrice") ?? "0"),
    });
  });

  return positions;
}

export function IBKRPortfolio() {
  const [config, setConfig] = useState<IBKRConfig>(loadConfig);
  const [positions, setPositions] = useState<IBKRPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const proxyBase = config.proxyUrl || (import.meta.env.DEV ? "http://localhost:3456" : "");

  async function fetchPositions() {
    if (!config.token || !config.queryId) {
      setShowSetup(true);
      return;
    }
    if (!proxyBase) {
      setError("No proxy URL configured. Add your local proxy URL in settings below.");
      setShowSetup(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: request report generation
      const reqRes = await fetch(
        `${proxyBase}/ibkr-flex/request?t=${encodeURIComponent(config.token)}&q=${encodeURIComponent(config.queryId)}`
      );
      const reqData = await reqRes.json() as { referenceCode?: string; error?: string };
      if (!reqRes.ok || reqData.error) throw new Error(reqData.error ?? "Request failed");

      const refCode = reqData.referenceCode;
      if (!refCode) throw new Error("No reference code returned");

      // Step 2: poll for statement (IBKR takes a few seconds)
      await new Promise((r) => setTimeout(r, 3000));

      const stmtRes = await fetch(`${proxyBase}/ibkr-flex/statement?q=${encodeURIComponent(refCode)}`);
      const xml = await stmtRes.text();
      if (!stmtRes.ok) throw new Error(`Statement fetch failed: ${stmtRes.status}`);

      const parsed = parseFlexXML(xml);
      setPositions(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function updateConfig(partial: Partial<IBKRConfig>) {
    const next = { ...config, ...partial };
    setConfig(next);
    saveConfig(next);
  }

  const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const optionPositions = positions.filter(p => p.assetCategory === "OPT");
  const stockPositions = positions.filter(p => p.assetCategory === "STK");

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>

      {/* Fetch bar */}
      <div className="flex gap-2">
        <button
          onClick={fetchPositions}
          disabled={loading}
          className="flex-1 py-2.5 bg-sky-700 hover:bg-sky-600 text-white font-medium rounded-xl text-sm transition-colors disabled:opacity-40"
        >
          {loading ? "Loading..." : "Fetch Positions"}
        </button>
        <button
          onClick={() => setShowSetup((v) => !v)}
          className="px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-slate-400 hover:text-white text-sm transition-colors"
        >
          ⚙
        </button>
      </div>

      {/* Setup panel */}
      {showSetup && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-200">IBKR Flex Query Setup</h3>

          <SetupField
            label="Flex Token"
            placeholder="From IBKR → Account Management → Flex Queries"
            value={config.token}
            onChange={(v) => updateConfig({ token: v })}
          />
          <SetupField
            label="Query ID"
            placeholder="From your saved Flex Query"
            value={config.queryId}
            onChange={(v) => updateConfig({ queryId: v })}
          />
          <SetupField
            label="Proxy URL"
            placeholder="e.g. http://localhost:3456 (run: npm run proxy)"
            value={config.proxyUrl}
            onChange={(v) => updateConfig({ proxyUrl: v })}
          />

          <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 flex flex-col gap-1.5">
            <p className="font-medium text-slate-300">Setup steps</p>
            <p>1. In IBKR Account Management → Reports → Flex Queries → Create Query</p>
            <p>2. Include: Open Positions, format XML, date range Today</p>
            <p>3. Note the Query ID and generate a Flex Token (30-day expiry)</p>
            <p>4. Start local proxy: <code className="bg-slate-800 px-1 rounded">npm run proxy</code> in the repo</p>
            <p>5. Set Proxy URL to <code className="bg-slate-800 px-1 rounded">http://localhost:3456</code></p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rose-900/30 border border-rose-700/50 rounded-xl px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Positions */}
      {positions.length > 0 && (
        <>
          {/* Summary */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-slate-500 text-xs">Unrealized P&L</p>
              <p className={`font-bold text-sm ${totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {totalPnL >= 0 ? "+" : ""}${totalPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Options</p>
              <p className="font-bold text-sm text-rose-300">{optionPositions.length}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Stocks</p>
              <p className="font-bold text-sm text-sky-300">{stockPositions.length}</p>
            </div>
          </div>

          {optionPositions.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide -mb-1">Options</h3>
              {optionPositions.map((p, i) => <PositionCard key={i} pos={p} />)}
            </>
          )}

          {stockPositions.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide -mb-1">Stocks</h3>
              {stockPositions.map((p, i) => <PositionCard key={i} pos={p} />)}
            </>
          )}
        </>
      )}

      {!loading && positions.length === 0 && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-12">
          <div className="text-4xl">🔗</div>
          <p className="text-slate-400 text-sm">Connect your IBKR account to see live positions.</p>
          <p className="text-slate-600 text-xs">Requires the local proxy server and a Flex Query token.</p>
        </div>
      )}
    </div>
  );
}

function PositionCard({ pos }: { pos: IBKRPosition }) {
  const isShort = pos.quantity < 0;
  const pnlColor = pos.unrealizedPnL >= 0 ? "text-emerald-400" : "text-rose-400";
  const isOption = pos.assetCategory === "OPT";

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">{pos.symbol}</span>
            {isOption && pos.putCall && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                pos.putCall === "P" ? "text-rose-300 bg-rose-500/15" : "text-violet-300 bg-violet-500/15"
              }`}>
                {pos.putCall === "P" ? "PUT" : "CALL"}
              </span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${isShort ? "text-amber-300 bg-amber-500/15" : "text-sky-300 bg-sky-500/15"}`}>
              {isShort ? "SHORT" : "LONG"}
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5 truncate max-w-[220px]">{pos.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-semibold text-sm ${pnlColor}`}>
            {pos.unrealizedPnL >= 0 ? "+" : ""}${pos.unrealizedPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-slate-500 text-xs">P&L</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 text-center border-t border-slate-700/40 pt-2">
        <Metric label="Qty" value={String(pos.quantity)} />
        <Metric label="Mark" value={pos.markPrice ? `$${pos.markPrice.toFixed(2)}` : "—"} />
        {isOption && <Metric label="Strike" value={pos.strike ? `$${pos.strike}` : "—"} />}
        {isOption && <Metric label="Expiry" value={pos.expiry ?? "—"} />}
        {!isOption && <Metric label="Basis" value={pos.costBasisPrice ? `$${pos.costBasisPrice.toFixed(2)}` : "—"} />}
        {!isOption && <Metric label="Value" value={`$${Math.abs(pos.currentValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />}
      </div>
    </div>
  );
}

function SetupField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-500" style={{ fontSize: "10px" }}>{label}</span>
      <span className="text-slate-200 text-xs font-medium">{value}</span>
    </div>
  );
}
