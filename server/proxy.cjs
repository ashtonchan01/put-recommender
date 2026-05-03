/**
 * Simple Yahoo Finance proxy server with crumb authentication.
 * Handles the cookie/crumb flow automatically.
 * Run: node server/proxy.js
 */

const http = require("http");
const https = require("https");

const PORT = 3456;
let cachedCrumb = null;
let cachedCookies = null;
let crumbExpiry = 0;

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ...headers,
      },
    };
    https
      .get(options, (res) => {
        let data = "";
        const responseCookies = res.headers["set-cookie"] || [];
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ data, statusCode: res.statusCode, cookies: responseCookies })
        );
      })
      .on("error", reject);
  });
}

async function refreshCrumb() {
  // Step 1: Get cookie from fc.yahoo.com
  const fcRes = await httpsGet("https://fc.yahoo.com");
  const cookies = fcRes.cookies
    .map((c) => c.split(";")[0])
    .join("; ");

  // Step 2: Get crumb using cookie
  const crumbRes = await httpsGet(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    { Cookie: cookies }
  );

  if (crumbRes.statusCode === 200 && crumbRes.data && !crumbRes.data.includes("error")) {
    cachedCrumb = crumbRes.data.trim();
    cachedCookies = cookies;
    crumbExpiry = Date.now() + 30 * 60 * 1000; // 30 min
    console.log(`  Crumb refreshed: ${cachedCrumb.substring(0, 8)}...`);
    return true;
  }
  console.error("  Failed to get crumb:", crumbRes.data);
  return false;
}

async function getCrumb() {
  if (cachedCrumb && Date.now() < crumbExpiry) {
    return { crumb: cachedCrumb, cookies: cachedCookies };
  }
  await refreshCrumb();
  return { crumb: cachedCrumb, cookies: cachedCookies };
}

async function proxyRequest(path) {
  const { crumb, cookies } = await getCrumb();
  if (!crumb) throw new Error("No crumb available");

  const separator = path.includes("?") ? "&" : "?";
  const url = `https://query2.finance.yahoo.com${path}${separator}crumb=${encodeURIComponent(crumb)}`;

  const res = await httpsGet(url, { Cookie: cookies });
  return { data: res.data, statusCode: res.statusCode };
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", crumb: !!cachedCrumb }));
    return;
  }

  // Proxy Yahoo Finance requests
  // Expected path: /v7/finance/options/NVDA, /v8/finance/chart/NVDA, etc.
  if (url.pathname.startsWith("/v7/") || url.pathname.startsWith("/v8/")) {
    try {
      const yahooPath = url.pathname + url.search;
      const result = await proxyRequest(yahooPath);
      res.writeHead(result.statusCode, { "Content-Type": "application/json" });
      res.end(result.data);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // IBKR Flex Query — two-step flow
  // Step 1: /ibkr-flex/request?t=TOKEN&q=QUERYID  → returns { referenceCode }
  // Step 2: /ibkr-flex/statement?q=REFCODE        → returns XML statement
  if (url.pathname === "/ibkr-flex/request") {
    const token = url.searchParams.get("t");
    const queryId = url.searchParams.get("q");
    if (!token || !queryId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing t or q parameter" }));
      return;
    }
    try {
      const flexUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
      const result = await httpsGet(flexUrl);
      // Response is XML: <FlexStatementOperationInfo><Status>Success</Status><ReferenceCode>XXXXX</ReferenceCode>...
      const refMatch = result.data.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/);
      const statusMatch = result.data.match(/<Status>([^<]+)<\/Status>/);
      const errMatch = result.data.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
      if (errMatch) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errMatch[1] }));
        return;
      }
      if (refMatch) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ referenceCode: refMatch[1], status: statusMatch?.[1] }));
      } else {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No reference code in response", raw: result.data.substring(0, 200) }));
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/ibkr-flex/statement") {
    const refCode = url.searchParams.get("q");
    if (!refCode) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing q parameter" }));
      return;
    }
    try {
      const flexUrl = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement?q=${encodeURIComponent(refCode)}&v=3`;
      const result = await httpsGet(flexUrl);
      res.writeHead(result.statusCode, { "Content-Type": "text/xml" });
      res.end(result.data);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // v10 Yahoo Finance (quoteSummary for earnings)
  if (url.pathname.startsWith("/v10/")) {
    try {
      const yahooPath = url.pathname + url.search;
      const result = await proxyRequest(yahooPath);
      res.writeHead(result.statusCode, { "Content-Type": "application/json" });
      res.end(result.data);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`\n  Yahoo Finance Proxy running on http://localhost:${PORT}`);
  console.log("  Endpoints: /v7/finance/options/<SYMBOL>");
  console.log("             /v8/finance/chart/<SYMBOL>\n");
  refreshCrumb().then(() => console.log("  Ready!\n"));
});
