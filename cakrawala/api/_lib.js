// Util bersama: fetch Yahoo dengan cache memori singkat.
const UA = 'Mozilla/5.0';
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  if(cache.size>500)cache.delete(cache.keys().next().value);
  cache.set(key, { t: Date.now(), v });
  return v;
}
async function yahooChart(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal:AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('yahoo ' + r.status);
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error('tak ada data ' + symbol);
  return res;
}
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Crumb + cookie Yahoo untuk quoteSummary (fundamental).
let crumbState = null;
async function yahooCrumb() {
  if (crumbState && Date.now() - crumbState.t < 3600e3) return crumbState;
  const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const cookie = (r1.headers.getSetCookie ? r1.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ');
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
  const crumb = await r2.text();
  if (!crumb || crumb.length > 40) throw new Error('crumb gagal');
  crumbState = { t: Date.now(), cookie, crumb };
  return crumbState;
}
async function readBody(req) {
  let b = '';
  for await (const c of req) { b += c; if (b.length > 5e6) throw new Error('body terlalu besar'); }
  return b ? JSON.parse(b) : {};
}
const modeOf=req=>{const m=new URL(req.url,'http://localhost').searchParams.get('mode')||'demo';if(!['demo','live'].includes(m))throw new Error('Mode data tidak valid.');return m;};
const symbolOf=value=>{const s=String(value||'').trim().toUpperCase();if(!/^[A-Z0-9^][A-Z0-9.^=\-]{0,23}$/.test(s))throw new Error('Kode instrumen tidak valid.');return s;};
module.exports = { UA, cached, yahooChart, yahooCrumb, readBody, send, modeOf, symbolOf };
