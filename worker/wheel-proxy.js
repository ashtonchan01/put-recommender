/**
 * Wheel Tracker — Cloudflare Worker
 *
 * Handles:
 *   1. Yahoo Finance proxy (crumb auth, CORS)
 *   2. IBKR Flex Web Service proxy (CORS)
 *
 * Deploy: Cloudflare Dashboard → Workers & Pages → Create Worker
 *         Paste this entire file → Save and Deploy
 *         Set the worker route or use the *.workers.dev URL.
 *
 * Routes:
 *   /v7/*  /v8/*  /v10/*   → Yahoo Finance query2
 *   /ibkr-flex/request     → IBKR FlexStatementService.SendRequest
 *   /ibkr-flex/statement   → IBKR FlexStatementService.GetStatement
 *   /ping                  → health check
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── Health check ────────────────────────────────────────────────────────
    if (path === "/ping") {
      return json({ status: "ok" });
    }

    // ── IBKR Flex — Step 1: SendRequest ────────────────────────────────────
    if (path === "/ibkr-flex/request") {
      const token   = url.searchParams.get("t");
      const queryId = url.searchParams.get("q");
      if (!token || !queryId) return json({ error: "Missing t or q" }, 400);

      const ibkrUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
      const res = await fetch(ibkrUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const text = await res.text();

      const refMatch  = text.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/);
      const errMatch  = text.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
      const codeMatch = text.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);

      if (errMatch) return json({ error: errMatch[1], code: codeMatch?.[1] }, 400);
      if (refMatch) return json({ referenceCode: refMatch[1] });
      return json({ error: "No reference code in IBKR response", raw: text.slice(0, 300) }, 500);
    }

    // ── IBKR Flex — Step 2: GetStatement ───────────────────────────────────
    if (path === "/ibkr-flex/statement") {
      const refCode = url.searchParams.get("q");
      if (!refCode) return json({ error: "Missing q" }, 400);

      const ibkrUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement?q=${encodeURIComponent(refCode)}&v=3`;
      const res = await fetch(ibkrUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const text = await res.text();

      return new Response(text, {
        status: res.status,
        headers: { ...CORS, "Content-Type": "text/xml" },
      });
    }

    // ── Yahoo Finance proxy ─────────────────────────────────────────────────
    if (path.startsWith("/v7/") || path.startsWith("/v8/") || path.startsWith("/v10/")) {
      try {
        const { crumb, cookies } = await getYahooCrumb(ctx);
        const sep = url.search ? "&" : "?";
        const yahooUrl = `https://query2.finance.yahoo.com${path}${url.search}${sep}crumb=${encodeURIComponent(crumb)}`;

        const res = await fetch(yahooUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Cookie": cookies,
          },
        });

        if (res.status === 429) return json({ error: "Rate limited" }, 429);

        const body = await res.text();
        return new Response(body, {
          status: res.status,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};

// ── Yahoo crumb ─────────────────────────────────────────────────────────────
// Cached in memory for the Worker instance lifetime (~5 min).

let _crumb = null;
let _cookies = null;
let _crumbExpiry = 0;

async function getYahooCrumb(ctx) {
  if (_crumb && Date.now() < _crumbExpiry) {
    return { crumb: _crumb, cookies: _cookies };
  }

  // Step 1: get cookie
  const fcRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const setCookies = fcRes.headers.getSetCookie?.() ?? [];
  const cookies = setCookies.map(c => c.split(";")[0]).join("; ");

  // Step 2: get crumb
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Cookie": cookies,
    },
  });

  if (!crumbRes.ok) throw new Error("Failed to fetch Yahoo crumb");
  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes("error")) throw new Error("Invalid crumb");

  _crumb = crumb.trim();
  _cookies = cookies;
  _crumbExpiry = Date.now() + 25 * 60 * 1000; // 25 min

  return { crumb: _crumb, cookies: _cookies };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
