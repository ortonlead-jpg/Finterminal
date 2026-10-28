// GET /api/summary?symbol=BBCA.JK -> profil, valuasi, statistik, target analis, laporan keuangan ringkas
const { cached, yahooCrumb, send, UA, modeOf } = require('./_lib');
const raw = v => (v && typeof v === 'object' && 'raw' in v) ? v.raw : (v && typeof v === 'object' ? undefined : v);
const flat = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => k !== 'maxAge').map(([k, v]) => [k, raw(v)]).filter(([, v]) => v !== undefined));
module.exports = async (req, res) => {
  const symbol = new URL(req.url, 'http://x').searchParams.get('symbol') || '';
  if (!/^[\w.^=-]{1,20}$/.test(symbol)) return send(res, 400, { error: 'simbol tidak valid' });
  try {
    if(modeOf(req)==='demo')return send(res,200,require('./_demo').summary(symbol));
    const out = await cached('sum:' + symbol, 600000, async () => {
      const { cookie, crumb } = await yahooCrumb();
      const mods = 'assetProfile,summaryDetail,defaultKeyStatistics,financialData,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory,price';
      const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}&crumb=${encodeURIComponent(crumb)}`, { headers: { 'User-Agent': UA, Cookie: cookie } });
      const j = await r.json();
      const x = j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
      if (!x) throw new Error((j.quoteSummary && j.quoteSummary.error && j.quoteSummary.error.description) || 'tak ada data');
      const stm = (h, key) => ((h && h[key]) || []).map(s => flat(s)).map(s => { if (s.endDate) s.endDate = new Date(s.endDate * 1000).toISOString().slice(0, 10); return s; });
      const p = x.assetProfile || {};
      return {
        symbol, name: (x.price && x.price.longName) || symbol,
        profile: { sector: p.sector, industry: p.industry, website: p.website, employees: p.fullTimeEmployees, summary: p.longBusinessSummary, country: p.country },
        detail: flat(x.summaryDetail), stats: flat(x.defaultKeyStatistics), fin: flat(x.financialData),
        income: stm(x.incomeStatementHistory, 'incomeStatementHistory'),
        balance: stm(x.balanceSheetHistory, 'balanceSheetStatements'),
        cashflow: stm(x.cashflowStatementHistory, 'cashflowStatements'),
        mode:'live',source:'Yahoo Finance · fundamental',reportingCurrency:x.financialData?.financialCurrency||x.price?.currency||null,asOf:null,fetchedAt:new Date().toISOString(),
      };
    });
    send(res, 200, out);
  } catch (e) { send(res, 502, { error: e.message }); }
};
