// GET /api/quote?symbols=BBCA.JK,^JKSE  -> harga + perubahan harian per simbol
const { cached, yahooChart, send, modeOf, symbolOf } = require('./_lib');
async function one(sym) {
  return cached('q:' + sym, 30000, async () => {
    try {
      const c = await yahooChart(sym, '5d', '1d');
      const closes = (c.indicators.quote[0].close || []).filter(v => v != null);
      const vols = (c.indicators.quote[0].volume || []);
      const price = c.meta.regularMarketPrice ?? closes[closes.length - 1];
      const prev = closes.length >= 2 ? closes[closes.length - 2] : closes[0];
      return { symbol: sym, name: c.meta.shortName || c.meta.symbol, price, prev,
               chg: price - prev, pct: prev ? (price - prev) / prev * 100 : 0,
               vol: vols[vols.length - 1] || 0, spark: closes, currency:c.meta.currency,mode:'live',source:'Yahoo Finance · dapat tertunda',asOf:c.meta.regularMarketTime?new Date(c.meta.regularMarketTime*1000).toISOString():null,fetchedAt:new Date().toISOString() };
    } catch (e) { return { symbol: sym, error: e.message }; }
  });
}
module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams.get('symbols') || '';
  try {
    const syms=[...new Set(q.split(',').filter(s=>s.trim()).map(symbolOf))].slice(0,80);
    if(modeOf(req)==='demo')return send(res,200,syms.map(symbol=>{try{return require('./_demo').quote(symbol);}catch(e){return {symbol,error:e.message,mode:'demo'};}}));
    send(res,200,await Promise.all(syms.map(one)));
  }catch(e){send(res,422,{error:e.message});}
};
module.exports.one=one;
